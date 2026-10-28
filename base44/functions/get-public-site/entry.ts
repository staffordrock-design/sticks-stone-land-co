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

    // Availability only: never return premium values through this public route.
    // A failed lookup stays unknown instead of being mislabeled as absent.
    const links = [{ mining_site_id: siteId }];
    if (site.msha_mine_id) links.push({ msha_mine_id: site.msha_mine_id });
    const has = async (entity, extra = []) => {
      try {
        const rows = await svc.entities[entity].filter({ $or: [...links, ...extra] }, '-updated_date', 1, 0);
        return rows.length > 0;
      } catch { return null; }
    };
    const parcelLinks = site.parcel_id ? [{ parcel_id: site.parcel_id }] : [];
    const [parcel, geology, permits, environmental, production, deeds] = await Promise.all([
      has('ParcelRecord', parcelLinks), has('GeologyRecord', parcelLinks),
      has('TDECPermit', site.tdec_permit_number ? [{ permit_number: site.tdec_permit_number }] : []),
      has('EnvironmentalRecord', site.npdes_permit_number ? [{ npdes_permit_number: site.npdes_permit_number }] : []),
      has('ProductionRecord'), has('DeedRecord', parcelLinks),
    ]);
    return Response.json({
      coverage: { parcel, geology, permits, environmental, production, deeds },
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