import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

const PRICE_ID = 'price_1U48bwHBH3xrClLVcvrOM02j';

function randomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default async function(req) {
  try {
    const body = await req.json();
    const listing_id = body?.listing_id;
    const channel = body?.channel;
    if (!listing_id) return Response.json({ error: 'listing_id required' }, { status: 400 });
    if (channel !== 'web') return Response.json({ error: 'Website checkout only' }, { status: 403 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const agreements = await base44.asServiceRole.entities.NDAAgreement.filter(
      { listing_id, user_id: user.id, agreed: true }, '-created_date', 1, 0
    );
    if (!agreements?.[0]) return Response.json({ error: 'Signed NDA required before checkout' }, { status: 403 });

    const existingAccess = await base44.asServiceRole.entities.DataRoomAccess.filter(
      { listing_id, user_id: user.id, paid: true }, '-created_date', 1, 0
    );
    if (existingAccess?.[0]) return Response.json({ already_paid: true });

    let listing_title = 'Data Room Access';
    try {
      const listing = await base44.asServiceRole.entities.Listing.get(listing_id);
      if (listing?.title) listing_title = listing.title;
    } catch (e) {
      console.error('listing lookup failed:', e);
    }

    const originHeader = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const origin = originHeader || (referer ? new URL(referer).origin : 'https://app.base44.com');
    const stripeSecret = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeSecret, { apiVersion: '2026-06-24.dahlia' });

    const price = await stripe.prices.retrieve(PRICE_ID);
    if (!price?.active) return Response.json({ error: 'Data-room price is not active in Stripe' }, { status: 503 });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      integration_identifier: `ssrockholdings_${randomSuffix()}`,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID') || '',
        listing_id,
        listing_title,
        user_id: user.id,
        user_email: user.email || '',
        purchase_surface: 'website',
        purchase_type: 'data_room_access',
      },
      success_url: `${origin}/listings/${listing_id}?checkout_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/listings/${listing_id}`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('create-data-room-checkout error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
