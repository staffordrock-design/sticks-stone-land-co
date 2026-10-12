import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public endpoint: returns public-safe fields for a single MiningSite by ID.
// Service role bypasses admin-only RLS so the quarry record page renders for
// paid AND unpaid visitors. Premium fields (owner, parcel, deed, geology,
// permits, production, environmental, contracts, valuation) are never returned
// here — those stay behind the get-premium-site-data entitlement gate.

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const siteId = String(body?.mining_site_id || '').trim();
    if (!siteId) return Response.json({ error: 'Site ID required' }, { status: 400 });

    const site = await svc.entities.MiningSite.get(siteId).catch(() => null);
    if (!site) return Response.json({ error: 'Site not found' }, { status: 404 });

    return Response.json({
      site: {
        id: site.id,
        mine_name: site.mine_name,
        mine_status: site.mine_status,
        mine_type: site.mine_type,
        commodity: site.commodity,
        county: site.county,
        state: site.state,
        city: site.city,
        source: site.source,
        latitude: site.latitude,
        longitude: site.longitude,
        is_verified_listing: site.is_verified_listing || false,
        listing_id: site.listing_id || null,
        site_images: Array.isArray(site.site_images) ? site.site_images : [],
        msha_mine_id: site.msha_mine_id || null,
        operator_name: site.operator_name || null,
        acreage: site.acreage || null,
        tdec_permit_number: site.tdec_permit_number || null,
        npdes_permit_number: site.npdes_permit_number || null,
        last_source_update: site.last_source_update || null,
        source_url: site.source_url || null,
      },
    });
  } catch (error) {
    console.error('get-public-site error:', error);
    return Response.json({ error: 'Failed to load site' }, { status: 500 });
  }
}