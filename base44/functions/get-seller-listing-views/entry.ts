import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Returns aggregated view analytics for the listings linked to the signed-in
// seller's submissions. Uses service role to read admin-only
// ListingAnalyticsDaily records, but only for listing IDs the seller owns.

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Find this seller's submissions that have been linked to a published listing.
    const subs = await base44.entities.SellerSubmission.filter({ user_id: user.id }, '-submitted_at', 200);
    const listingIds = (subs || [])
      .map((s: any) => s.listing_id)
      .filter(Boolean) as string[];

    if (listingIds.length === 0) {
      return Response.json({ listings: [] });
    }

    // Fetch all analytics rows for those listings (service role bypasses RLS).
    const svc = base44.asServiceRole;
    const analyticsRows = await svc.entities.ListingAnalyticsDaily.filter(
      {},
      '-date',
      5000
    ).catch(() => []);

    // Group by listing_id and sum the metrics.
    const byListing = new Map<string, any>();
    for (const row of analyticsRows || []) {
      const lid = String(row.listing_id || '');
      if (!listingIds.includes(lid)) continue;
      const existing = byListing.get(lid) || {
        listing_id: lid,
        total_views: 0,
        unique_viewers: 0,
        saves: 0,
        inquiries: 0,
        data_room_requests: 0,
        offers: 0,
        days_tracked: 0,
        last_view_date: null as string | null,
      };
      existing.total_views += Number(row.views) || 0;
      existing.unique_viewers += Number(row.unique_viewers) || 0;
      existing.saves += Number(row.saves) || 0;
      existing.inquiries += Number(row.inquiries) || 0;
      existing.data_room_requests += Number(row.data_room_requests) || 0;
      existing.offers += Number(row.offers) || 0;
      existing.days_tracked += 1;
      if (!existing.last_view_date || (row.date && row.date > existing.last_view_date)) {
        existing.last_view_date = row.date || existing.last_view_date;
      }
      byListing.set(lid, existing);
    }

    // Match back to submission names so the UI can display them.
    const listings = listingIds.map((lid) => {
      const sub = subs.find((s: any) => s.listing_id === lid);
      const stats = byListing.get(lid) || {
        listing_id: lid,
        total_views: 0,
        unique_viewers: 0,
        saves: 0,
        inquiries: 0,
        data_room_requests: 0,
        offers: 0,
        days_tracked: 0,
        last_view_date: null,
      };
      return {
        ...stats,
        property_name: sub?.property_name || 'Unknown property',
        county: sub?.county || null,
        state: sub?.state || null,
        status: sub?.status || null,
      };
    });

    return Response.json({ listings });
  } catch (error) {
    console.error('get-seller-listing-views error:', error);
    return Response.json({ error: error?.message || 'Could not load listing views.' }, { status: 500 });
  }
}