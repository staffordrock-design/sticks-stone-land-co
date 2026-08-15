import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const body = await req.json();
    const checkout_id = body?.checkout_id;
    if (!checkout_id) return Response.json({ error: 'checkout_id required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const stripeSecret = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeSecret, { apiVersion: '2026-06-24.dahlia' });
    const session = await stripe.checkout.sessions.retrieve(checkout_id);
    const sessionUserId = session.metadata?.user_id || session.client_reference_id || null;
    if (!sessionUserId || sessionUserId !== user.id) {
      return Response.json({ error: 'Checkout session does not belong to this user' }, { status: 403 });
    }

    const paid = session.payment_status === 'paid';
    const listing_id = session.metadata?.listing_id || null;

    if (paid && listing_id) {
      const existing = await base44.asServiceRole.entities.DataRoomAccess.filter(
        { listing_id, user_id: user.id, paid: true }, '-created_date', 1, 0
      );
      if (!existing?.[0]) {
        await base44.asServiceRole.entities.DataRoomAccess.create({
          listing_id,
          listing_title: session.metadata?.listing_title || '',
          user_id: user.id,
          customer_email: user.email || session.customer_details?.email || '',
          stripe_session_id: session.id,
          paid: true,
        });
      }
    }

    return Response.json({ paid, listing_id });
  } catch (error) {
    console.error('verify-data-room-access error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
