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
  if (!FULL_PLAN_CODES.has(planCode)) return null;

  const subscriptionId = String(subscription?.id || '').trim();
  if (!subscriptionId) throw new Error('Stripe subscription ID missing');

  const status = entitlementStatus(String(subscription?.status || ''));
  const now = new Date().toISOString();
  const isActive = ['active', 'grace_period'].includes(status);

  // Always record a BillingEvent so paid status is visible in the platform
  // dashboard — even for anonymous web checkouts that have no S&S user_id yet.
  const billingData = {
    user_id: userId,
    customer_email: String(subscription?.customer_email || metadata.customer_email || ''),
    revenue_type: 'Subscription',
    plan_or_product: planCode,
    amount: Number(subscription?.items?.data?.[0]?.price?.unit_amount || 3900) / 100,
    currency: String(subscription?.currency || 'usd').toUpperCase(),
    platform: 'Stripe',
    status: isActive ? 'Paid' : 'Pending',
    external_transaction_id: subscriptionId,
    occurred_at: now,
    notes: userId ? 'Stripe webhook verified.' : 'Anonymous web checkout — Stripe webhook verified.',
  };
  const existingBilling = await base44.asServiceRole.entities.BillingEvent.filter(
    { external_transaction_id: subscriptionId },
    '-created_date',
    1,
    0,
  );
  if (existingBilling?.[0]) {
    await base44.asServiceRole.entities.BillingEvent.update(existingBilling[0].id, billingData);
  } else {
    await base44.asServiceRole.entities.BillingEvent.create(billingData);
  }

  // Entitlement requires a user_id — skip for anonymous checkouts until the
  // buyer signs in and claims the subscription via verify-stripe-subscription.
  if (!userId) return null;

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

// One record per Stripe event, keyed by the event id, so a second delivery of the
// same event (a retry, or the same event arriving at more than one registered
// endpoint) can never be applied twice. The description records which host the
// verified delivery arrived on, for auditing the webhook setup.
async function recordWebhookEvent(base44: any, data: {
  eventId: string;
  eventType: string;
  status: 'Processed' | 'Failed' | 'Ignored';
  message?: string;
  host?: string;
}) {
  try {
    const existing = await base44.asServiceRole.entities.WebhookEvent.filter(
      { provider: 'Stripe', external_event_id: data.eventId },
      '-created_date',
      1,
      0,
    );
    const now = new Date().toISOString();
    const payload = {
      provider: 'Stripe',
      external_event_id: data.eventId,
      event_type: data.eventType,
      status: data.status,
      received_at: existing?.[0]?.received_at || now,
      processed_at: data.status === 'Processed' ? now : existing?.[0]?.processed_at || '',
      error_message: String(data.message || '').slice(0, 900),
      description: `Verified delivery via ${data.host || 'unknown host'}`,
    };
    if (existing?.[0]) {
      await base44.asServiceRole.entities.WebhookEvent.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.WebhookEvent.create(payload);
    }
  } catch (error) {
    console.error('stripe-webhook: event log write failed', error);
  }
}

export default async function(req: Request) {
  let seenEventId = '';
  let seenEventType = '';
  let seenHost = '';
  let rawBodyLength = 0;
  try {
    console.log('stripe-webhook: delivery received from host', req.headers.get('host') || req.headers.get('x-forwarded-host') || 'unknown');
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
    rawBodyLength = rawBody.length;
    // The runtime's crypto is async-only, so the async verifier is required here.
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    const object: any = event.data.object;
    const deliveryHost = req.headers.get('host') || req.headers.get('x-forwarded-host') || '';
    seenEventId = String(event.id || '');
    seenEventType = String(event.type || '');
    seenHost = deliveryHost;

    // Idempotency: if this event was already applied, acknowledge and stop.
    try {
      const seen = await base44.asServiceRole.entities.WebhookEvent.filter(
        { provider: 'Stripe', external_event_id: event.id },
        '-created_date',
        1,
        0,
      );
      if (seen?.[0]?.status === 'Processed') {
        return Response.json({ received: true, duplicate: true });
      }
    } catch (error) {
      console.error('stripe-webhook: duplicate check failed', error);
    }

    // Base44's merchant self-test checkout is not a customer order.
    if (
      (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') &&
      String(object?.metadata?.base44_test_checkout || '') === 'true'
    ) {
      await recordWebhookEvent(base44, {
        eventId: event.id,
        eventType: event.type,
        status: 'Ignored',
        message: 'Base44 self-test checkout',
        host: deliveryHost,
      });
      return Response.json({ received: true, ignored: true });
    }

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

    if (seenEventId) {
      await recordWebhookEvent(base44, {
        eventId: seenEventId,
        eventType: seenEventType,
        status: 'Processed',
        host: seenHost,
      });
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('stripe-webhook error:', error);
    {
      try {
        const base44 = createClientFromRequest(req);
        // A delivery that fails before the event is parsed has no event id — key
        // it per host so the same rejection updates one row instead of piling up.
        const host = seenHost || req.headers.get('host') || req.headers.get('x-forwarded-host') || 'unknown';
        await recordWebhookEvent(base44, {
          eventId: seenEventId || `unverified_delivery:${host}`,
          eventType: seenEventId ? seenEventType : 'signature_rejected',
          status: 'Failed',
          message: `${error?.message || String(error)} (payload ${rawBodyLength} bytes)`,
          host,
        });
      } catch (logError) {
        console.error('stripe-webhook: failure log write failed', logError);
      }
    }
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}