import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

export default async function(req) {
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

    const stripe = new Stripe(stripeSecret, { apiVersion: '2026-06-24.dahlia' });
    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const listing_id = session.metadata?.listing_id;
      const user_id = session.metadata?.user_id || session.client_reference_id || '';
      if (listing_id && user_id && session.payment_status === 'paid') {
        const existing = await base44.asServiceRole.entities.DataRoomAccess.filter(
          { listing_id, user_id, paid: true }, '-created_date', 1, 0
        );
        if (!existing?.[0]) {
          await base44.asServiceRole.entities.DataRoomAccess.create({
            listing_id,
            listing_title: session.metadata?.listing_title || '',
            user_id,
            customer_email: session.metadata?.user_email || session.customer_details?.email || '',
            stripe_session_id: session.id,
            paid: true,
          });
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('stripe-webhook error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}
