import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { evaluatePremiumEntitlement } from '../../shared/premiumEntitlement.ts';

// Public endpoint: returns a large set of quarry records with only public-safe
// fields (identity, location, coordinates, source, listing flag). Service role
// bypasses admin-only RLS so the homepage populates for paid AND unpaid
// visitors. Premium fields (owner, operator, parcel, permits, geology,
// production, valuation) are never returned here — those stay behind the
// get-premium-site-data entitlement gate for paid members.
//
// The stored S&S screening values (opportunity score and estimate range) are the
// exception, and only for an ENTITLED caller: the home list needs them to render
// each card's stored score and stored estimate, and relying on the separate
// bulk entity read left every card without them. Unentitled callers get the same
// records with no screening fields at all.

const SOUTHEAST_STATES = ['TN', 'GA', 'AL', 'KY', 'NC', 'SC', 'FL', 'MS'];
const LIMIT = 3000;

const SCREENING_FIELDS = [
  'screening_opportunity_score',
  'screening_band',
  'screening_value_low',
  'screening_value_mid',
  'screening_value_high',
  'screening_value_per_acre_low',
  'screening_value_per_acre_high',
  'screening_value_confidence',
];

function isQuarryRelevant(site: any) {
  const commodity = String(site?.commodity || '').toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes('coal')) return false;
  return ['stone', 'limestone', 'sand', 'gravel', 'aggregate', 'marble', 'granite', 'slate', 'shale', 'quartz', 'clay', 'dolomite', 'rock', 'lime'].some((term) => commodity.includes(term));
}

function storedScreening(site: any) {
  const out: any = {};
  for (const key of SCREENING_FIELDS) {
    const value = site?.[key];
    out[key] = value === undefined ? null : value;
  }
  return out;
}

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const rawState = String(body?.state || 'TN').toUpperCase();
    const states = (rawState === 'ALL' || !rawState) ? SOUTHEAST_STATES : [rawState];

    const user = await base44.auth.me().catch(() => null);
    const entitled = await evaluatePremiumEntitlement({
      base44,
      user,
      appleTransactions: body?.apple_transactions,
      appleAppTransaction: body?.apple_app_transaction,
      stripeSessionId: body?.stripe_session_id,
      stripeBrowserSessionId: body?.stripe_browser_session_id,
    }).catch(() => false);

    // Distribute the sample evenly across requested states so "All Southeast"
    // shows a meaningful slice from each state rather than filling from TN first.
    const PER_STATE = Math.ceil(LIMIT / states.length);
    // Only the first PER_STATE relevant rows per state are kept, so reading the
    // full 3,000 rows for each of 8 states was wasted work on every map load.
    // Read with headroom for coal and other filtered-out rows.
    const perStateRead = Math.min(3000, Math.max(400, PER_STATE * 2));
    const rows = await Promise.all(states.map((st) =>
      svc.entities.MiningSite.filter({ state: st }, '-updated_date', perStateRead).catch(() => [])
    ));
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
          msha_mine_id: s.msha_mine_id || null,
          operator_name: s.operator_name || null,
          acreage: s.acreage || null,
          tdec_permit_number: s.tdec_permit_number || null,
          last_source_update: s.last_source_update || null,
          ...(entitled ? storedScreening(s) : {}),
        });
        added++;
        if (added >= PER_STATE) break;
      }
      if (out.length >= LIMIT) break;
    }

    return Response.json({ sites: out, entitled });
  } catch (error) {
    console.error('get-public-quarry-list error:', error);
    return Response.json({ sites: [], entitled: false });
  }
}