import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public endpoint: returns real database statistics for the homepage trust band.
// Returns only aggregate counts and state lists — no individual record data.
// This is safe to expose publicly because it contains no premium field-level data.

function isQuarryRelevant(site: any) {
  const commodity = String(site?.commodity || '').toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes('coal')) return false;
  return ['stone', 'limestone', 'sand', 'gravel', 'aggregate', 'marble', 'granite', 'slate', 'shale', 'quartz', 'clay', 'dolomite', 'rock', 'lime'].some((term) => commodity.includes(term));
}

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Query MiningSite records — we only need counts and metadata, not full records.
    // Use a large limit to get an accurate count. Sort by -updated_date so the
    // first record gives us the latest refresh date.
    const allSites = await svc.entities.MiningSite.filter({}, '-updated_date', 10000).catch(() => []);

    const quarrySites = (allSites || []).filter(isQuarryRelevant);
    const recordCount = quarrySites.length;

    // Distinct states that actually have records
    const stateSet = new Set<string>();
    for (const s of quarrySites) {
      const st = String(s.state || '').trim().toUpperCase();
      if (st) stateSet.add(st);
    }
    const statesCovered = Array.from(stateSet).sort();

    // Latest refresh date — use the most recent updated_date across all records
    let latestRefresh: string | null = null;
    for (const s of allSites || []) {
      const d = s.updated_date || s.last_source_update || s.created_date;
      if (d && (!latestRefresh || d > latestRefresh)) latestRefresh = d;
    }

    // Source families — static labels describing the intelligence sources S&S uses
    const sources = [
      'MSHA',
      'State mining & environmental agencies',
      'County GIS / parcel records',
      'Deeds / ownership records',
      'USGS',
      'Geology datasets',
      'TDOT / transportation demand data',
    ];

    return Response.json({
      recordCount,
      statesCovered,
      latestRefresh,
      sources,
    });
  } catch (error) {
    console.error('get-public-stats error:', error);
    return Response.json({
      recordCount: 0,
      statesCovered: [],
      latestRefresh: null,
      sources: [],
    });
  }
}