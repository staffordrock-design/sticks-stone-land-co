import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const body = await req.json();
    const checkout_id = body?.checkout_id;
    if (!checkout_id) {
      return Response.json({ error: 'checkout_id required' }, { status: 400 });
    }

    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));
    const session = await stripe.checkout.sessions.retrieve(checkout_id);

    return Response.json({
      paid: session.payment_status === 'paid',
      listing_id: session.metadata?.listing_id || null,
    });
  } catch (error) {
    console.error('verify-data-room-access error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}