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

function subscriptionPeriodEnd(subscription: any) {
  return subscription?.current_period_end || subscription?.items?.data?.[0]?.current_period_end || null;
}

function subscriptionStart(subscription: any) {
  return subscription?.start_date || subscription?.created || null;
}

function subscriptionPriceId(subscription: any) {
  return String(subscription?.items?.data?.[0]?.price?.id || '');
}

async function upsertWebEntitlement(base44: any, subscription: any, fallbackMetadata: any = {}) {
  const metadata = { ...(fallbackMetadata || {}), ...(subscription?.metadata || {}) };
  const userId = String(metadata.user_id || '').trim();
  const planCode = String(metadata.plan_code || '').trim();
  if (!userId || !FULL_PLAN_CODES.has(planCode)) return null;

  const subscriptionId = String(subscription?.id || '').trim();
  if (!subscriptionId) throw new Error('Stripe subscription ID missing');

  const status = entitlementStatus(String(subscription?.status || ''));
  const now = new Date().toISOString();
  const data = {
    user_id: userId,
    plan_code: planCode,
    status,
    platform: 'web',
    product_id: subscriptionPriceId(subscription),
    original_transaction_id: subscriptionId,
    expires_at: isoFromSeconds(subscriptionPeriodEnd(subscription)),
    started_at: isoFromSeconds(subscriptionStart(subscription)),
    last_verified_at: now,
    source: 'Stripe verified webhook',
  };

  const existing = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
    { user_id: userId, platform: 'web', original_transaction_id: subscriptionId },
    '-updated_date',
    1,
    0,
  );

  if (existing?.[0]) {
    await base44.asServiceRole.entities.SubscriptionEntitlement.update(existing[0].id, data);
  } else {
    await base44.asServiceRole.entities.SubscriptionEntitlement.create(data);
  }

  return data;
}

async function subscriptionIdFromInvoice(invoice: any) {
  return String(
    invoice?.subscription ||
    invoice?.parent?.subscription_details?.subscription ||
    invoice?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ||
    ''
  );
}

export default async function(req: Request) {
  try {
    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    const webhookSecret = secrets.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeKey || !webhookSecret) {
      return Response.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) return Response.json({ error: 'Missing Stripe signature' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
    const rawBody = await req.text();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const object: any = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const subscriptionId = String(object?.subscription || '');
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertWebEntitlement(base44, subscription, object?.metadata || {});
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await upsertWebEntitlement(base44, object);
    } else if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
      const subscriptionId = await subscriptionIdFromInvoice(object);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertWebEntitlement(base44, subscription);
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('stripe-webhook error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}
