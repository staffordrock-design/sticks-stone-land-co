import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

const PRICE_ID = 'price_1U2STtGhM20yzyv2KNtLc55L';

export default async function(req) {
  try {
    const body = await req.json();
    const listing_id = body?.listing_id;
    if (!listing_id) {
      return Response.json({ error: 'listing_id required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    let listing_title = 'Data Room Access';
    try {
      const listing = await base44.asServiceRole.entities.Listing.get(listing_id);
      if (listing?.title) listing_title = listing.title;
    } catch (e) {
      console.error('listing lookup failed:', e);
    }

    const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://app.base44.com';
    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        listing_id,
        listing_title,
      },
      success_url: `${origin}/listings/${listing_id}?checkout_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/listings/${listing_id}`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('create-data-room-checkout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}