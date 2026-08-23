import { createClientFromRequest } from 'npm:@base44/sdk';

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const body = await req.json();
    const listingId = typeof body?.listing_id === 'string' ? body.listing_id : '';
    if (!listingId) return Response.json({ error: 'listing_id required' }, { status: 400 });

    if (user.role !== 'admin') {
      const [agreements, access] = await Promise.all([
        base44.asServiceRole.entities.NDAAgreement.filter(
          { listing_id: listingId, user_id: user.id, agreed: true }, '-created_date', 1, 0
        ),
        base44.asServiceRole.entities.DataRoomAccess.filter(
          { listing_id: listingId, user_id: user.id, paid: true }, '-created_date', 1, 0
        ),
      ]);
      if (!agreements?.[0]) return Response.json({ error: 'Signed NDA required' }, { status: 403 });
      if (!access?.[0]) return Response.json({ error: 'Verified data-room access required' }, { status: 403 });
    }

    const listing = await base44.asServiceRole.entities.Listing.get(listingId);
    if (!listing) return Response.json({ error: 'Listing not found' }, { status: 404 });

    return Response.json({
      listing_id: listingId,
      core_drilling_url: listing.core_drilling_url || '',
      environmental_report_url: listing.environmental_report_url || '',
    });
  } catch (error) {
    console.error('get-data-room-documents error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
