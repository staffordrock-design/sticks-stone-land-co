import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public sample endpoint: returns ONE fully-enriched quarry record so unpaid
// visitors can "taste" the full intelligence before subscribing. This is the
// only premium data exposed without an entitlement — a single designated
// sample record. All other premium data stays behind get-premium-site-data.

function isQuarryRelevant(site) {
  const commodity = String(site?.commodity || '').toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes('coal')) return false;
  return ['stone', 'limestone', 'sand', 'gravel', 'aggregate', 'marble', 'granite', 'slate', 'shale', 'quartz', 'clay', 'dolomite', 'rock', 'lime'].some((term) => commodity.includes(term));
}

function completeness(s) {
  return [s.mine_name, s.mine_status, s.commodity, s.operator_name, s.county, s.latitude, s.longitude, s.tdec_permit_number, s.npdes_permit_number, s.parcel_id, s.acreage].filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Get active TN quarries with valid coordinates, pick the most complete one.
    const rows = await svc.entities.MiningSite.filter({ state: 'TN' }, '-updated_date', 200).catch(() => []);
    const quarrySites = (rows || []).filter((s) => {
      if (!s?.id || !isQuarryRelevant(s)) return false;
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24 && lat <= 40 && lng >= -92 && lng <= -78;
    });

    if (quarrySites.length === 0) {
      return Response.json({ site: null, geology: null, parcel: null, permits: [], environmental: [], profile: null });
    }

    // Prefer active sites, then pick the most complete record.
    const active = quarrySites.filter((s) => /active/i.test(String(s.mine_status || '')));
    const pool = (active.length > 0 ? active : quarrySites).slice(0, 30);
    const sample = pool.sort((a, b) => completeness(b) - completeness(a))[0];

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