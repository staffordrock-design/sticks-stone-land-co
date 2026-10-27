import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public endpoint: returns real database statistics for the homepage trust band.
// Returns only aggregate counts and state lists — no individual record data.

function isQuarryRelevant(site: any) {
  const commodity = String(site?.commodity || '').toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes('coal')) return false;
  return ['stone', 'limestone', 'sand', 'gravel', 'aggregate', 'marble', 'granite', 'slate', 'shale', 'quartz', 'clay', 'dolomite', 'rock', 'lime'].some((term) => commodity.includes(term));
}

function hasValue(v: any) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

// These are inventory-wide counts that only change when a data sync runs, but
// computing them scans the whole mine and parcel inventory. Cache the payload
// per warm instance so a page visit doesn't rescan the database each time.
let statsCache: any = null;
let statsCachedAt = 0;
const STATS_TTL_MS = 10 * 60 * 1000;

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    if (statsCache && Date.now() - statsCachedAt < STATS_TTL_MS) {
      return Response.json(statsCache);
    }

    const allSites = await svc.entities.MiningSite.filter({}, '-updated_date', 10000).catch(() => []);

    const quarrySites = (allSites || []).filter(isQuarryRelevant);
    const recordCount = quarrySites.length;

    // Mapped mine locations: records with valid latitude AND longitude
    const mappedCount = quarrySites.filter((s: any) =>
      hasValue(s.latitude) && hasValue(s.longitude) &&
      Number(s.latitude) !== 0 && Number(s.longitude) !== 0
    ).length;

    // Parcel-linked: records with a non-empty parcel_id
    const parcelLinkedCount = quarrySites.filter((s: any) => hasValue(s.parcel_id)).length;

    // Deed-linked: count ParcelRecord entries with deed book/page references
    let deedLinkedCount = 0;
    try {
      const parcelRecords = await svc.entities.ParcelRecord.filter({ deed_book_page: { $ne: '' } }, '-updated_date', 5000).catch(() => []);
      deedLinkedCount = (parcelRecords || []).filter((p: any) => hasValue(p.deed_book_page)).length;
    } catch { /* ignore */ }

    // Enriched: records with cross-source data beyond basic MSHA identity
    // (has at least one of: parcel_id, tdec_permit_number, npdes_permit_number, operator_name)
    const enrichedCount = quarrySites.filter((s: any) =>
      hasValue(s.parcel_id) || hasValue(s.tdec_permit_number) || hasValue(s.npdes_permit_number) || hasValue(s.operator_name)
    ).length;

    // Distinct states that actually have records
    const stateSet = new Set<string>();
    for (const s of quarrySites) {
      const st = String(s.state || '').trim().toUpperCase();
      if (st) stateSet.add(st);
    }
    const statesCovered = Array.from(stateSet).sort();

    // Latest refresh date
    let latestRefresh: string | null = null;
    for (const s of allSites || []) {
      const d = s.updated_date || s.last_source_update || s.created_date;
      if (d && (!latestRefresh || d > latestRefresh)) latestRefresh = d;
    }

    const sources = [
      'MSHA',
      'State mining & environmental agencies',
      'County GIS / parcel records',
      'Deeds / ownership records',
      'USGS',
      'Geology datasets',
      'TDOT / transportation demand data',
    ];

    const payload = {
      recordCount,
      mappedCount,
      parcelLinkedCount,
      deedLinkedCount,
      enrichedCount,
      statesCovered,
      latestRefresh,
      sources,
    };
    statsCache = payload;
    statsCachedAt = Date.now();
    return Response.json(payload);
  } catch (error) {
    console.error('get-public-stats error:', error);
    return Response.json({
      recordCount: 0,
      mappedCount: 0,
      parcelLinkedCount: 0,
      deedLinkedCount: 0,
      enrichedCount: 0,
      statesCovered: [],
      latestRefresh: null,
      sources: [],
    });
  }
}