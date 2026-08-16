import { createClientFromRequest } from 'npm:@base44/sdk';
import { verifyApplePurchases } from '../../shared/appleVerify.ts';

const DATA_ROOM_PRODUCT_ID = 'com.ssrockholdings.dataroom.access';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const body = await req.json();
    const signedTransaction = typeof body?.signed_transaction === 'string' ? body.signed_transaction : '';
    const signedAppTransaction = typeof body?.signed_app_transaction === 'string' ? body.signed_app_transaction : '';
    const listingId = typeof body?.listing_id === 'string' ? body.listing_id : '';

    if (!signedTransaction) return Response.json({ error: 'Apple signed transaction required' }, { status: 400 });
    if (!listingId) return Response.json({ error: 'listing_id required' }, { status: 400 });

    // NDA must be signed before data-room access is granted
    const agreements = await base44.asServiceRole.entities.NDAAgreement.filter(
      { listing_id: listingId, user_id: user.id, agreed: true }, '-created_date', 1, 0
    );
    if (!agreements?.[0]) return Response.json({ error: 'Signed NDA required before data-room access' }, { status: 403 });

    // Already unlocked for this listing?
    const existing = await base44.asServiceRole.entities.DataRoomAccess.filter(
      { listing_id: listingId, user_id: user.id, paid: true }, '-created_date', 1, 0
    );
    if (existing?.[0]) return Response.json({ already_paid: true, paid: true, listing_id: listingId });

    const { verified } = await verifyApplePurchases({
      signedTransactions: [signedTransaction],
      signedAppTransaction,
      expectedUserId: user.id,
    });

    const purchase = verified[0];
    if (!purchase) return Response.json({ error: 'Apple transaction could not be verified' }, { status: 400 });
    if (purchase.productId !== DATA_ROOM_PRODUCT_ID) {
      return Response.json({ error: 'This Apple purchase is not for data-room access' }, { status: 400 });
    }

    // Fraud prevention: one Apple consumable transaction unlocks one listing only
    const reused = await base44.asServiceRole.entities.DataRoomAccess.filter(
      { apple_transaction_id: purchase.originalTransactionId, paid: true }, '-created_date', 1, 0
    );
    if (reused?.[0] && reused[0].listing_id !== listingId) {
      return Response.json({ error: 'This Apple purchase was already used for another listing' }, { status: 409 });
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
      apple_transaction_id: purchase.originalTransactionId,
      paid: true,
    });

    return Response.json({ paid: true, listing_id: listingId });
  } catch (error) {
    console.error('verify-apple-data-room error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}