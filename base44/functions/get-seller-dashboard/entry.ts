import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // User-scoped queries — RLS allows sellers to read their own submissions
    // and data room requests where they are the opportunity owner.
    const submissions = await base44.entities.SellerSubmission.filter(
      { user_id: user.id }, "-submitted_at", 100
    );

    const dataRoomRequests = await base44.entities.DataRoomRequest.filter(
      { opportunity_owner_user_id: user.id }, "-requested_at", 200
    );

    const dataRoomAccesses = await base44.entities.DataRoomAccess.filter(
      { opportunity_owner_user_id: user.id }, "-granted_at", 200
    );

    // Extract listing IDs from data room requests for admin-only entity lookups
    const listingIds = [...new Set(
      dataRoomRequests.map((r) => r.listing_id).filter(Boolean)
    )];

    const admin = base44.asServiceRole;

    // Service role: NDAAgreement is admin/singer-only, seller needs aggregate counts
    let ndaCount = 0;
    const ndaByListing: Record<string, number> = {};
    if (listingIds.length > 0) {
      const ndaFilter = listingIds.length === 1
        ? { listing_id: listingIds[0] }
        : { $or: listingIds.map((id) => ({ listing_id: id })) };
      const ndaRecords = await admin.entities.NDAAgreement.filter(ndaFilter, "-created_date", 500);
      ndaCount = ndaRecords.length;
      for (const n of ndaRecords) {
        const key = n.listing_id || 'unknown';
        ndaByListing[key] = (ndaByListing[key] || 0) + 1;
      }
    }

    // Service role: ViewerActivity is admin-only, aggregate views per listing
    let totalViews = 0;
    const viewsByListing: Record<string, number> = {};
    const uniqueViewerKeys = new Set<string>();
    if (listingIds.length > 0) {
      const listingPaths = listingIds.map((id) => `/listings/${id}`);
      const activityFilter = listingPaths.length === 1
        ? { path: listingPaths[0] }
        : { $or: listingPaths.map((p) => ({ path: p })) };
      const activities = await admin.entities.ViewerActivity.filter(activityFilter, "-viewed_at", 1000);
      totalViews = activities.length;
      for (const a of activities) {
        uniqueViewerKeys.add(a.user_id || a.session_id || a.id);
        const match = listingIds.find((id) => a.path === `/listings/${id}`);
        if (match) {
          viewsByListing[match] = (viewsByListing[match] || 0) + 1;
        }
      }
    }

    // Build per-submission performance
    const performance = submissions.map((sub) => {
      const requests = dataRoomRequests.filter(
        (r) => r.seller_submission_id === sub.id
      );
      const listingId = requests[0]?.listing_id || '';
      const accesses = dataRoomAccesses.filter(
        (a) => a.listing_id === listingId
      );
      const pendingRequests = requests.filter(
        (r) => ["Requested", "Qualification Review", "NDA Required"].includes(r.status)
      );

      return {
        submission_id: sub.id,
        listing_id: listingId,
        property_name: sub.property_name,
        status: sub.status,
        asking_price: sub.asking_price,
        state: sub.state,
        county: sub.county,
        asset_type: sub.asset_type,
        acreage: sub.acreage,
        views: listingId ? (viewsByListing[listingId] || 0) : 0,
        data_room_requests: requests.length,
        pending_requests: pendingRequests.length,
        data_room_accesses_granted: accesses.filter((a) => a.access_status === "Granted").length,
        ndas_signed: listingId ? (ndaByListing[listingId] || 0) : 0,
      };
    });

    // Active (pending) data room requests
    const activeRequests = dataRoomRequests
      .filter((r) => ["Requested", "Qualification Review", "NDA Required"].includes(r.status))
      .map((r) => ({
        id: r.id,
        listing_id: r.listing_id,
        opportunity_title: r.opportunity_title,
        buyer_company: r.buyer_company,
        purpose: r.purpose,
        nda_agreed: r.nda_agreed,
        status: r.status,
        requested_at: r.requested_at,
        seller_submission_id: r.seller_submission_id,
      }));

    // All requests for history table
    const allRequests = dataRoomRequests.map((r) => ({
      id: r.id,
      listing_id: r.listing_id,
      opportunity_title: r.opportunity_title,
      buyer_company: r.buyer_company,
      purpose: r.purpose,
      nda_agreed: r.nda_agreed,
      status: r.status,
      requested_at: r.requested_at,
      decided_at: r.decided_at,
    }));

    const summary = {
      total_properties: submissions.length,
      active_listings: submissions.filter((s) =>
        ["Marketing", "Under Offer", "Approved"].includes(s.status)
      ).length,
      total_views: totalViews,
      unique_viewers: uniqueViewerKeys.size,
      total_data_room_requests: dataRoomRequests.length,
      pending_requests: activeRequests.length,
      total_accesses_granted: dataRoomAccesses.filter((a) => a.access_status === "Granted").length,
      total_ndas: ndaCount,
    };

    return Response.json({
      summary,
      performance,
      active_requests: activeRequests,
      all_requests: allRequests,
    });
  } catch (error) {
    console.error('get-seller-dashboard error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}