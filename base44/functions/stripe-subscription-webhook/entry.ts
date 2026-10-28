import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import Stripe from 'npm:stripe@23.0.1';
import { secrets } from 'base44:runtime';
import {
  upsertWebEntitlement,
  recordPaidStripeInvoice,
  recordWebhookEvent,
  subscriptionIdFromInvoice,
} from '../../shared/stripeEntitlement.ts';

// Receives Stripe subscription lifecycle events and keeps paid access in sync.
// Signature verification happens before any record is touched, and each event id
// is applied at most once.
export default async function (req: Request): Promise<Response> {
  let seenEventId = '';
  let seenEventType = '';
  let seenHost = '';

  try {
    const base44 = createClientFromRequest(req);

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    const webhookSecret = secrets.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeKey || !webhookSecret) {
      return Response.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) return Response.json({ error: 'Missing Stripe signature' }, { status: 400 });

    const stripe = new Stripe(stripeKey);
    const rawBody = await req.text();
    const event: any = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);

    const object: any = event?.data?.object || {};
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || '';
    seenEventId = String(event?.id || '');
    seenEventType = String(event?.type || '');
    seenHost = host;

    if (seenEventId) {
      const seen = await base44.asServiceRole.entities.WebhookEvent
        .filter({ provider: 'Stripe', external_event_id: seenEventId }, '-created_date', 1, 0)
        .catch(() => []);
      if (seen?.[0]?.status === 'Processed') {
        return Response.json({ received: true, duplicate: true });
      }
    }

    // Base44's own test checkout is not a customer order.
    if (
      (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') &&
      String(object?.metadata?.base44_test_checkout || '') === 'true'
    ) {
      await recordWebhookEvent(base44, {
        eventId: seenEventId,
        eventType: seenEventType,
        status: 'Ignored',
        message: 'Base44 self-test checkout',
        host,
      });
      return Response.json({ received: true, ignored: true });
    }

    if (event.type === 'checkout.session.completed') {
      const subscriptionId = String(object?.subscription || '');
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertWebEntitlement(base44, subscription, object?.metadata || {});
        if (object.invoice) {
          const invoice = await stripe.invoices.retrieve(String(object.invoice));
          await recordPaidStripeInvoice(base44, invoice, { ...object.metadata, ...subscription.metadata });
        }
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const current = await stripe.subscriptions.retrieve(String(object.id));
      await upsertWebEntitlement(base44, current);
    } else if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
      const subscriptionId = subscriptionIdFromInvoice(object);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertWebEntitlement(base44, subscription);
        if (event.type === 'invoice.payment_succeeded') await recordPaidStripeInvoice(base44, object, subscription.metadata);
      }
    }

    if (seenEventId) {
      await recordWebhookEvent(base44, {
        eventId: seenEventId,
        eventType: seenEventType,
        status: 'Processed',
        host,
      });
    }

    return Response.json({ received: true });
  } catch (error: any) {
    console.error('stripe subscription webhook error:', error);
    try {
      const base44 = createClientFromRequest(req);
      const host = seenHost || req.headers.get('host') || 'unknown';
      await recordWebhookEvent(base44, {
        eventId: seenEventId || `unverified_delivery:${host}`,
        eventType: seenEventType || 'signature_rejected',
        status: 'Failed',
        message: error?.message || String(error),
        host,
      });
    } catch (logError) {
      console.error('stripe subscription webhook: failure log write failed', logError);
    }
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}