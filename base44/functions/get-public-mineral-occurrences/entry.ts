import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Public endpoint: returns USGS MRDS mineral occurrence records with
// public-safe fields (identity, location, commodity, match status, geology).
// USGS MRDS is a public database, so these records are safe to show to all
// visitors as a marketing/intelligence map. Service role bypasses the
// admin-only RLS so the map populates for paid AND unpaid visitors.
//
// Premium S&S-curated intelligence (ownership, parcels, permits, production,
// valuation) stays behind the get-premium-site-data entitlement gate.

const SOUTHEAST_STATES = ['TN', 'GA', 'AL', 'KY', 'NC', 'SC', 'FL', 'MS'];
const PER_STATE_LIMIT = 1500;

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const rawState = String(body?.state || 'ALL').toUpperCase();
    const states = (rawState === 'ALL' || !rawState) ? SOUTHEAST_STATES : [rawState];

    const pages = await Promise.all(states.map((st) =>
      svc.entities.USGSMineralOccurrence.filter({ occurrence_state: st }, '-created_date', PER_STATE_LIMIT).catch(() => [])
    ));

    const out: any[] = [];
    for (const stateRows of pages) {
      for (const o of stateRows || []) {
        if (!o?.id || !o?.latitude || !o?.longitude) continue;
        out.push({
          id: o.id,
          occurrence_name: o.occurrence_name,
          mrds_id: o.mrds_id,
          occurrence_state: o.occurrence_state,
          occurrence_county: o.occurrence_county,
          latitude: o.latitude,
          longitude: o.longitude,
          commodity: o.commodity,
          commodity_list: o.commodity_list,
          deposit_type: o.deposit_type,
          mineralogy: o.mineralogy,
          host_rock: o.host_rock,
          development_status: o.development_status,
          operation_type: o.operation_type,
          production_size: o.production_size,
          match_status: o.match_status,
          mining_site_id: o.mining_site_id || null,
          distance_meters: o.distance_meters ?? null,
          source_url: o.source_url || null,
        });
      }
    }

    return Response.json({ occurrences: out, total: out.length });
  } catch (error) {
    console.error('get-public-mineral-occurrences error:', error);
    return Response.json({ occurrences: [], total: 0 });
  }
}