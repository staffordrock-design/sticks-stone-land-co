import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

function entitlementStatus(stripeStatus: string) {
  switch (stripeStatus) {
    case 'active': return 'active';
    case 'trialing': return 'trial';
    case 'past_due': return 'grace_period';
    case 'canceled': return 'cancelled';
    case 'unpaid':
    case 'incomplete_expired': return 'expired';
    default: return 'inactive';
  }
}

function subscriptionExpiry(subscription: any) {
  const seconds = Number(subscription?.items?.data?.[0]?.current_period_end || subscription?.current_period_end || 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : '';
}

async function upsertWebEntitlement(base44: any, subscription: any, fallbackUserId = '', fallbackPlanCode = '') {
  const subscriptionId = String(subscription?.id || '');
  if (!subscriptionId) return;

  let userId = String(subscription?.metadata?.user_id || fallbackUserId || '');
  let planCode = String(subscription?.metadata?.plan_code || fallbackPlanCode || '');

  const bySubscription = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
    { platform: 'web', original_transaction_id: subscriptionId }, '-updated_date', 1, 0
  );
  const existingBySubscription = bySubscription?.[0] || null;
  if (!userId) userId = String(existingBySubscription?.user_id || '');
  if (!planCode) planCode = String(existingBySubscription?.plan_code || '');
  if (!userId || !planCode) {
    console.warn('stripe-webhook: subscription missing S&S user/plan metadata', subscriptionId);
    return;
  }

  const priceId = String(subscription?.items?.data?.[0]?.price?.id || existingBySubscription?.product_id || '');
  const startedSeconds = Number(subscription?.start_date || subscription?.created || 0);
  const payload = {
    user_id: userId,
    plan_code: planCode,
    status: entitlementStatus(String(subscription?.status || '')),
    platform: 'web',
    product_id: priceId,
    original_transaction_id: subscriptionId,
    started_at: startedSeconds > 0 ? new Date(startedSeconds * 1000).toISOString() : (existingBySubscription?.started_at || new Date().toISOString()),
    expires_at: subscriptionExpiry(subscription),
    last_verified_at: new Date().toISOString(),
    source: 'stripe_webhook',
  };

  if (existingBySubscription) {
    await base44.asServiceRole.entities.SubscriptionEntitlement.update(existingBySubscription.id, payload);
    return;
  }

  // Backward compatibility for an entitlement created by an older checkout-only webhook.
  const byUser = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
    { user_id: userId, platform: 'web' }, '-updated_date', 10, 0
  );
  const legacy = (byUser || []).find((row: any) => !row.original_transaction_id || row.original_transaction_id === subscriptionId);
  if (legacy) await base44.asServiceRole.entities.SubscriptionEntitlement.update(legacy.id, payload);
  else await base44.asServiceRole.entities.SubscriptionEntitlement.create(payload);
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const stripeSecret = secrets.get('STRIPE_SECRET_KEY');
    const webhookSecret = secrets.get('STRIPE_WEBHOOK_SECRET');
    const signature = req.headers.get('stripe-signature');
    if (!stripeSecret || !webhookSecret) {
      console.error('stripe-webhook is missing required Stripe secrets');
      return Response.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
    }
    if (!signature) return Response.json({ error: 'Missing Stripe signature' }, { status: 400 });

    const stripe = new Stripe(stripeSecret, { apiVersion: '2026-07-29.dahlia' });
    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session: any = event.data.object;
      const listingId = session.metadata?.listing_id;
      const userId = session.metadata?.user_id || session.client_reference_id || '';

      if (session.metadata?.purchase_type === 'subscription' && userId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
        await upsertWebEntitlement(base44, subscription, userId, session.metadata?.plan_code || '');
      } else if (listingId && userId && session.payment_status === 'paid') {
        const existing = await base44.asServiceRole.entities.DataRoomAccess.filter(
          { listing_id: listingId, user_id: userId, paid: true }, '-created_date', 1, 0
        );
        if (!existing?.[0]) {
          await base44.asServiceRole.entities.DataRoomAccess.create({
            listing_id: listingId,
            listing_title: session.metadata?.listing_title || '',
            user_id: userId,
            customer_email: session.metadata?.user_email || session.customer_details?.email || '',
            stripe_session_id: session.id,
            paid: true,
          });
        }
      }
    }

    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted') {
      await upsertWebEntitlement(base44, event.data.object);
    }

    return Response.json({ received: true });
  } catch (error: any) {
    console.error('stripe-webhook error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}
