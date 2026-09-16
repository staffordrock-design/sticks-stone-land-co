import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public teaser endpoint: returns a small, curated set of quarry records with
// only public-identity fields (mine name, county, state, commodity, status,
// source). No entitlement required. Premium fields (owner, parcel, permits,
// geology, production, valuation) are never returned here — those stay behind
// the get-premium-site-data entitlement gate.

const TEASER_LIMIT = 6;

function isQuarryRelevant(site) {
  const commodity = String(site?.commodity || '').toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes('coal')) return false;
  return ['stone', 'limestone', 'sand', 'gravel', 'aggregate', 'marble', 'granite', 'slate', 'shale', 'quartz', 'clay', 'dolomite', 'rock', 'lime'].some((term) => commodity.includes(term));
}

function statusGroup(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('intermittent') || s.includes('temporarily idled') || s.includes('nonproducing') || s.includes('non-producing') || s.includes('inactive')) return 'opportunity';
  if (s.includes('historical') || s.includes('abandon')) return 'historical';
  if (s.includes('active')) return 'active';
  return 'opportunity';
}

function pickTeaserFields(site) {
  return {
    id: site.id,
    mine_name: site.mine_name,
    mine_status: site.mine_status,
    commodity: site.commodity,
    county: site.county,
    state: site.state,
    source: site.source,
    is_verified_listing: site.is_verified_listing || false,
    listing_id: site.listing_id || null,
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Service role bypasses admin-only RLS on MiningSite. We return only
    // teaser-safe fields so no premium data leaks to unpaid visitors.
    const rows = await svc.entities.MiningSite.filter({ state: 'TN' }, '-updated_date', 100).catch(() => []);
    const quarrySites = (rows || []).filter((s) => s?.id && isQuarryRelevant(s));

    // Pick a diverse set: mix of active and opportunity sites from different counties.
    const active = quarrySites.filter((s) => statusGroup(s.mine_status) === 'active');
    const opportunity = quarrySites.filter((s) => statusGroup(s.mine_status) === 'opportunity');

    const seenCounties = new Set();
    const teaser = [];

    for (const s of active) {
      if (teaser.length >= 3) break;
      const county = String(s.county || '').toLowerCase();
      if (seenCounties.has(county)) continue;
      seenCounties.add(county);
      teaser.push(pickTeaserFields(s));
    }

    for (const s of opportunity) {
      if (teaser.length >= TEASER_LIMIT) break;
      const county = String(s.county || '').toLowerCase();
      if (seenCounties.has(county)) continue;
      seenCounties.add(county);
      teaser.push(pickTeaserFields(s));
    }

    // Fill remaining slots with any quarry sites not yet included.
    for (const s of quarrySites) {
      if (teaser.length >= TEASER_LIMIT) break;
      if (teaser.some((t) => t.id === s.id)) continue;
      teaser.push(pickTeaserFields(s));
    }

    return Response.json({ sites: teaser.slice(0, TEASER_LIMIT) });
  } catch (error) {
    console.error('get-teaser-sites error:', error);
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}