import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

const FULL_PLAN_CODES = new Set(['professional_monthly', 'marketplace_monthly']);

function entitlementStatus(stripeStatus: string) {
  switch (stripeStatus) {
    case 'trialing': return 'inactive';
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

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const { session_id, browser_session_id } = await req.json().catch(() => ({}));
    const sessionId = String(session_id || '').trim();
    const browserSessionId = String(browser_session_id || '').trim();
    if (!sessionId || !browserSessionId) {
      return Response.json({ error: 'Checkout session and browser session are required', active: false }, { status: 400 });
    }

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ error: 'Stripe is not configured', active: false }, { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

    const session: any = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    if (session?.mode !== 'subscription') return Response.json({ error: 'Checkout session is not a subscription', active: false }, { status: 400 });

    const checkoutFlow = String(session?.metadata?.checkout_flow || '');
    const expectedBrowserSessionId = String(session?.metadata?.browser_session_id || '');
    if (checkoutFlow !== 'anonymous_web') {
      return Response.json({ error: 'This checkout belongs to an S&S account', active: false }, { status: 403 });
    }
    if (!expectedBrowserSessionId || expectedBrowserSessionId !== browserSessionId) {
      return Response.json({ error: 'This checkout belongs to a different browser session', active: false }, { status: 403 });
    }

    const subscription: any = typeof session.subscription === 'string'
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;
    if (!subscription?.id) return Response.json({ error: 'Stripe subscription was not found', active: false }, { status: 404 });

    const planCode = String(subscription?.metadata?.plan_code || session?.metadata?.plan_code || '');
    if (!FULL_PLAN_CODES.has(planCode)) {
      return Response.json({ error: 'Subscription does not grant Full Quarry Intelligence', active: false }, { status: 403 });
    }

    const status = entitlementStatus(String(subscription.status || ''));
    const active = ['active', 'grace_period'].includes(status);
    const periodEnd = subscription?.current_period_end || subscription?.items?.data?.[0]?.current_period_end || null;

    if (active) {
      const billingData = {
        user_id: '',
        customer_email: String(session?.customer_details?.email || session?.customer_email || ''),
        revenue_type: 'Subscription',
        plan_or_product: planCode,
        amount: Number(session?.amount_total || 0) / 100,
        currency: String(session?.currency || 'usd').toUpperCase(),
        platform: 'Stripe',
        status: 'Paid',
        external_transaction_id: String(session.id),
        occurred_at: new Date().toISOString(),
        notes: 'Anonymous web subscription checkout verified.',
      };
      const existingBilling = await base44.asServiceRole.entities.BillingEvent.filter(
        { external_transaction_id: String(session.id) },
        '-created_date',
        1,
        0,
      );
      if (existingBilling?.[0]) await base44.asServiceRole.entities.BillingEvent.update(existingBilling[0].id, billingData);
      else await base44.asServiceRole.entities.BillingEvent.create(billingData);
    }

    return Response.json({
      verified: true,
      active,
      status,
      plan_code: planCode,
      expires_at: isoFromSeconds(periodEnd),
      platform: 'web',
    });
  } catch (error) {
    console.error('verify-public-stripe-subscription error:', error);
    return Response.json({ error: error?.message || String(error), active: false }, { status: 400 });
  }
}
