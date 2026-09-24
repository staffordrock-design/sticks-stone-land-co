import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public endpoint: returns a large set of quarry records with only public-safe
// fields (identity, location, coordinates, source, listing flag). Service role
// bypasses admin-only RLS so the homepage populates for paid AND unpaid
// visitors. Premium fields (owner, operator, parcel, permits, geology,
// production, valuation) are never returned here — those stay behind the
// get-premium-site-data entitlement gate for paid members.

const SOUTHEAST_STATES = ['TN', 'GA', 'AL', 'KY', 'NC', 'SC', 'FL', 'MS'];
const LIMIT = 3000;

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

    const body = await req.json().catch(() => ({}));
    const rawState = String(body?.state || 'TN').toUpperCase();
    const states = (rawState === 'ALL' || !rawState) ? SOUTHEAST_STATES : [rawState];

    const rows = await Promise.all(states.map((st) =>
      svc.entities.MiningSite.filter({ state: st }, '-updated_date', 3000).catch(() => [])
    ));
    // Distribute the sample evenly across requested states so "All Southeast"
    // shows a meaningful slice from each state rather than filling from TN first.
    const PER_STATE = Math.ceil(LIMIT / states.length);
    const seen = new Set();
    const out: any[] = [];
    for (const stateRows of rows) {
      let added = 0;
      for (const s of stateRows) {
        if (!s?.id || seen.has(s.id) || !isQuarryRelevant(s)) continue;
        seen.add(s.id);
        out.push({
          id: s.id,
          mine_name: s.mine_name,
          mine_status: s.mine_status,
          mine_type: s.mine_type,
          commodity: s.commodity,
          county: s.county,
          state: s.state,
          city: s.city,
          source: s.source,
          latitude: s.latitude,
          longitude: s.longitude,
          is_verified_listing: s.is_verified_listing || false,
          listing_id: s.listing_id || null,
          site_images: Array.isArray(s.site_images) ? s.site_images : [],
        });
        added++;
        if (added >= PER_STATE) break;
      }
      if (out.length >= LIMIT) break;
    }

    return Response.json({ sites: out });
  } catch (error) {
    console.error('get-public-quarry-list error:', error);
    return Response.json({ sites: [] });
  }
}