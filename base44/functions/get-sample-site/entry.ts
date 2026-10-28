import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public sample endpoint: returns ONE fully-enriched quarry record so unpaid
// visitors can "taste" the full intelligence before subscribing. This is the
// only premium data exposed without an entitlement — a single designated
// sample record. All other premium data stays behind get-premium-site-data.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Keep the preview and full public sample on the same designated record.
    const sample = await svc.entities.MiningSite.get('6a79fe40925c52c762c59a12');
    if (!sample) return Response.json({ error: 'Sample record unavailable' }, { status: 503 });

    const mshaId = sample.msha_mine_id || null;
    const parcelId = sample.parcel_id || null;
    const tdecPermit = sample.tdec_permit_number || null;
    const npdesPermit = sample.npdes_permit_number || null;

    const orFilter = (...conditions) => {
      const valid = conditions.filter((c) => c && Object.keys(c).length > 0);
      return valid.length > 1 ? { $or: valid } : (valid[0] || {});
    };

    const [geologyRows, parcelRows, permitRows, envRows, profileRows] = await Promise.all([
      svc.entities.GeologyRecord.filter(orFilter({ mining_site_id: sample.id }, mshaId ? { msha_mine_id: mshaId } : null), '-updated_date', 5).catch(() => []),
      svc.entities.ParcelRecord.filter(orFilter(parcelId ? { parcel_id: parcelId } : null, mshaId ? { msha_mine_id: mshaId } : null), '-updated_date', 5).catch(() => []),
      svc.entities.TDECPermit.filter(orFilter(mshaId ? { msha_mine_id: mshaId } : null, tdecPermit ? { permit_number: tdecPermit } : null), '-last_source_update', 10).catch(() => []),
      svc.entities.EnvironmentalRecord.filter(orFilter(mshaId ? { msha_mine_id: mshaId } : null, npdesPermit ? { npdes_permit_number: npdesPermit } : null), '-last_source_update', 10).catch(() => []),
      svc.entities.QuarryPotentialProfile.filter(orFilter({ mining_site_id: sample.id }, mshaId ? { msha_mine_id: mshaId } : null), '-updated_date', 3).catch(() => []),
    ]);

    return Response.json({
      site: sample,
      geology: (geologyRows || [])[0] || null,
      parcel: (parcelRows || [])[0] || null,
      permits: permitRows || [],
      environmental: envRows || [],
      profile: (profileRows || [])[0] || null,
    });
  } catch (error) {
    console.error('get-sample-site error:', error);
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}