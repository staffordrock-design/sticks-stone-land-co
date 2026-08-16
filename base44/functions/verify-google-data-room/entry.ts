import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { verifyGooglePurchase, GOOGLE_DATA_ROOM_PRODUCT_ID } from '../../shared/googlePlayVerify.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const body = await req.json();
    const productId = String(body?.productId || '');
    const purchaseToken = String(body?.purchaseToken || '');
    const listingId = String(body?.listing_id || '');

    if (!productId || !purchaseToken) return Response.json({ error: 'Google Play purchase token required' }, { status: 400 });
    if (!listingId) return Response.json({ error: 'listing_id required' }, { status: 400 });
    if (productId !== GOOGLE_DATA_ROOM_PRODUCT_ID) return Response.json({ error: 'This Google purchase is not for data-room access' }, { status: 400 });

    // NDA must be signed before data-room access is granted
    const agreements = await base44.asServiceRole.entities.NDAAgreement.filter(
      { listing_id: listingId, user_id: user.id, agreed: true }, '-created_date', 1, 0,
    );
    if (!agreements?.[0]) return Response.json({ error: 'Signed NDA required before data-room access' }, { status: 403 });

    // Already unlocked?
    const existing = await base44.asServiceRole.entities.DataRoomAccess.filter(
      { listing_id: listingId, user_id: user.id, paid: true }, '-created_date', 1, 0,
    );
    if (existing?.[0]) return Response.json({ already_paid: true, paid: true, listing_id: listingId });

    const verified = await verifyGooglePurchase({
      productId,
      purchaseToken,
      secrets,
      isSubscription: false,
    });

    if (verified.purchaseState !== 0) {
      return Response.json({ error: 'Google Play purchase is not in a purchased state' }, { status: 400 });
    }

    // Fraud prevention: one Google purchase token unlocks one listing only
    const reused = await base44.asServiceRole.entities.DataRoomAccess.filter(
      { apple_transaction_id: purchaseToken, paid: true }, '-created_date', 1, 0,
    );
    if (reused?.[0] && reused[0].listing_id !== listingId) {
      return Response.json({ error: 'This Google purchase was already used for another listing' }, { status: 409 });
    }

    let listingTitle = 'Data Room Access';
    try {
      const listing = await base44.asServiceRole.entities.Listing.get(listingId);
      if (listing?.title) listingTitle = listing.title;
    } catch (e) {
      console.error('listing lookup failed:', e);
    }

    await base44.asServiceRole.entities.DataRoomAccess.create({
      listing_id: listingId,
      listing_title: listingTitle,
      user_id: user.id,
      customer_email: user.email || '',
      apple_transaction_id: purchaseToken, // reuse field for Google purchase token
      paid: true,
    });

    return Response.json({ paid: true, listing_id: listingId });
  } catch (error) {
    console.error('verify-google-data-room error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}