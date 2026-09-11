import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

const FULL_PLAN_CODES = new Set(['professional_monthly', 'professional_annual', 'deal_monthly', 'deal_annual']);

function entitlementStatus(stripeStatus: string) {
  switch (stripeStatus) {
    case 'trialing': return 'trial';
    case 'active': return 'active';
    case 'past_due': return 'grace_period';
    case 'canceled': return 'cancelled';
    case 'unpaid':
    case 'incomplete_expired': return 'expired';
    default: return 'inactive';
  }
}

function isoFromSeconds(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : '';
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Create or sign in to your S&S account to finish activating this subscription' }, { status: 401 });

    const { session_id } = await req.json().catch(() => ({}));
    const sessionId = String(session_id || '').trim();
    if (!sessionId) return Response.json({ error: 'Stripe checkout session is required' }, { status: 400 });

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

    const session: any = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    if (session?.mode !== 'subscription') return Response.json({ error: 'Checkout session is not a subscription' }, { status: 400 });

    const sessionUserId = String(session?.metadata?.user_id || session?.client_reference_id || '');
    const anonymousCheckout = String(session?.metadata?.checkout_flow || '') === 'anonymous_web' || sessionUserId.startsWith('anonymous:');
    if (!anonymousCheckout && (!sessionUserId || sessionUserId !== user.id)) {
      return Response.json({ error: 'This checkout session belongs to a different S&S account' }, { status: 403 });
    }

    const buyerEmail = normalizeEmail(session?.customer_details?.email || session?.customer_email);
    const userEmail = normalizeEmail(user.email);
    if (anonymousCheckout && buyerEmail && userEmail && buyerEmail !== userEmail) {
      return Response.json({ error: `This checkout was paid with ${buyerEmail}. Sign in or create the S&S account with that email to activate access.` }, { status: 403 });
    }

    const subscription: any = typeof session.subscription === 'string'
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;
    if (!subscription?.id) return Response.json({ error: 'Stripe subscription was not found' }, { status: 404 });

    const planCode = String(subscription?.metadata?.plan_code || session?.metadata?.plan_code || '');
    if (!FULL_PLAN_CODES.has(planCode)) return Response.json({ error: 'Subscription does not grant Full Quarry Intelligence' }, { status: 403 });

    const status = entitlementStatus(String(subscription.status || ''));
    const active = ['active', 'trial', 'grace_period'].includes(status);
    const periodEnd = subscription?.current_period_end || subscription?.items?.data?.[0]?.current_period_end || null;
    const start = subscription?.start_date || subscription?.created || null;
    const priceId = String(subscription?.items?.data?.[0]?.price?.id || '');
    const entitlement = {
      user_id: user.id,
      plan_code: planCode,
      status,
      platform: 'web',
      product_id: priceId,
      original_transaction_id: String(subscription.id),
      expires_at: isoFromSeconds(periodEnd),
      started_at: isoFromSeconds(start),
      last_verified_at: new Date().toISOString(),
      source: anonymousCheckout ? 'Stripe anonymous checkout claimed after signup' : 'Stripe checkout session verified',
    };

    const existing = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
      { platform: 'web', original_transaction_id: String(subscription.id) },
      '-updated_date',
      1,
      0,
    );
    if (existing?.[0]) {
      if (existing[0].user_id && existing[0].user_id !== user.id) {
        return Response.json({ error: 'This subscription is already attached to another S&S account' }, { status: 409 });
      }
      await base44.asServiceRole.entities.SubscriptionEntitlement.update(existing[0].id, entitlement);
    } else {
      await base44.asServiceRole.entities.SubscriptionEntitlement.create(entitlement);
    }

    const billingData = {
      user_id: user.id,
      customer_email: user.email || buyerEmail || '',
      revenue_type: 'Subscription',
      plan_or_product: planCode,
      amount: Number(session?.amount_total || 0) / 100,
      currency: String(session?.currency || 'usd').toUpperCase(),
      platform: 'Stripe',
      status: active ? 'Paid' : 'Pending',
      external_transaction_id: String(session.id),
      occurred_at: new Date().toISOString(),
      notes: anonymousCheckout ? 'Anonymous web checkout attached after account creation.' : 'Web subscription checkout verified.',
    };
    const existingBilling = await base44.asServiceRole.entities.BillingEvent.filter(
      { external_transaction_id: String(session.id) },
      '-created_date',
      1,
      0,
    );
    if (existingBilling?.[0]) await base44.asServiceRole.entities.BillingEvent.update(existingBilling[0].id, billingData);
    else await base44.asServiceRole.entities.BillingEvent.create(billingData);

    return Response.json({ verified: true, active, entitlement });
  } catch (error) {
    console.error('verify-stripe-subscription error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}
