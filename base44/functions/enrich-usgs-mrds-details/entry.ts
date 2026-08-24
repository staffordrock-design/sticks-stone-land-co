import { createClientFromRequest } from "npm:@base44/sdk";
import {
  MRDS_WFS, MRDS_LAYER, MRDS_SOURCE,
  clean, validCoord, haversineMeters, normalizeName, parseGmlFeatures,
} from "../../shared/usgsMrds.ts";

const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number; name: string }> = {
  TN: { minLat: 34.8, maxLat: 36.8, minLng: -90.5, maxLng: -81.5, name: "Tennessee" },
  GA: { minLat: 30.2, maxLat: 35.2, minLng: -85.8, maxLng: -80.6, name: "Georgia" },
  AL: { minLat: 30.1, maxLat: 35.2, minLng: -88.7, maxLng: -84.7, name: "Alabama" },
  KY: { minLat: 36.3, maxLat: 39.3, minLng: -89.8, maxLng: -81.8, name: "Kentucky" },
  NC: { minLat: 33.7, maxLat: 36.8, minLng: -84.5, maxLng: -75.2, name: "North Carolina" },
  SC: { minLat: 31.9, maxLat: 35.3, minLng: -83.5, maxLng: -78.3, name: "South Carolina" },
  FL: { minLat: 24.2, maxLat: 31.2, minLng: -87.8, maxLng: -79.7, name: "Florida" },
  MS: { minLat: 30.0, maxLat: 35.2, minLng: -91.8, maxLng: -87.9, name: "Mississippi" },
};

const GENERIC_TERMS = new Set([
  "quarry", "pit", "mine", "plant", "prospect", "occurrence", "deposit",
  "no", "number", "unnamed", "unknown", "new", "old", "upper", "lower",
  "north", "south", "east", "west", "site", "location", "area", "sample",
  "crushed", "broken", "stone", "sand", "gravel", "clay", "shale", "rock",
  "limestone", "dolomite", "granite", "marble", "slate", "chalk", "marl",
]);

function isGenericName(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return true;
  const words = normalized.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return true;
  return words.every((w) => GENERIC_TERMS.has(w));
}

function countyMatches(a: unknown, b: unknown): boolean {
  const ca = String(a || "").toLowerCase().trim();
  const cb = String(b || "").toLowerCase().trim();
  return Boolean(ca && cb && (ca === cb || ca.includes(cb) || cb.includes(ca)));
}

function revalidateMatched(row: any, site: any): { status: string; method: string | null; dist: number | null; changed: boolean } {
  const currentStatus = row.match_status || "unmatched";
  const currentMethod = row.match_method || null;
  const currentDist = row.distance_meters ?? null;
  if (currentStatus !== "matched" || !site) return { status: currentStatus, method: currentMethod, dist: currentDist, changed: false };

  if (currentMethod === "coordinate" && validCoord(row.latitude, row.longitude) && validCoord(site.latitude, site.longitude)) {
    const dist = haversineMeters(Number(row.latitude), Number(row.longitude), Number(site.latitude), Number(site.longitude));
    if (dist <= 500) return { status: "matched", method: "coordinate", dist, changed: currentMethod !== "coordinate" || dist !== currentDist };
  }

  let coordDist: number | null = null;
  if (validCoord(row.latitude, row.longitude) && validCoord(site.latitude, site.longitude)) {
    coordDist = haversineMeters(Number(row.latitude), Number(row.longitude), Number(site.latitude), Number(site.longitude));
  }
  const nameIsGeneric = isGenericName(row.occurrence_name);
  const countyOK = countyMatches(row.occurrence_county, site.county);

  if (coordDist != null && coordDist <= 500) return { status: "matched", method: "coordinate", dist: coordDist, changed: currentMethod !== "coordinate" || coordDist !== currentDist };
  if (nameIsGeneric) {
    if (coordDist != null && coordDist <= 2000) return { status: "nearby", method: null, dist: coordDist, changed: currentStatus !== "nearby" };
    return { status: "unmatched", method: null, dist: coordDist, changed: currentStatus !== "unmatched" };
  }
  // Specific name: require corroboration. Coordinate within 10km is strong support.
  if (coordDist != null && coordDist <= 10000) return { status: "matched", method: currentMethod || "name", dist: coordDist, changed: coordDist !== currentDist };
  // County match is supporting evidence when coordinates are absent or far.
  if (countyOK && (coordDist == null || coordDist <= 50000)) return { status: "matched", method: currentMethod || "name", dist: coordDist, changed: coordDist !== currentDist };
  // No corroboration — too far for a name-only match.
  if (coordDist != null && coordDist <= 2000) return { status: "nearby", method: null, dist: coordDist, changed: currentStatus !== "nearby" };
  return { status: "unmatched", method: null, dist: coordDist, changed: currentStatus !== "unmatched" };
}

// Build the enrichment payload from WFS feature properties.
function buildEnrichmentPayload(props: Record<string, string>, coords: [number, number] | null, state: string, stateName: string, row: any): any {
  const mrdsId = clean(props.dep_id) || row.mrds_id;
  const ore = clean(props.ore);
  const gangue = clean(props.gangue);
  const otherMatl = clean(props.other_matl);
  const mineralogyParts = [
    ore ? `Ore: ${ore}` : null,
    gangue ? `Gangue: ${gangue}` : null,
    otherMatl ? `Other: ${otherMatl}` : null,
  ].filter(Boolean);
  const mineralogy = mineralogyParts.length ? mineralogyParts.join(" · ") : undefined;

  const hostRockParts = [clean(props.hrock_unit), clean(props.hrock_type)].filter(Boolean);
  const hostRock = hostRockParts.length ? [...new Set(hostRockParts)].join(" · ") : undefined;
  const assocRockParts = [clean(props.arock_unit), clean(props.arock_type)].filter(Boolean);
  const associatedRock = assocRockParts.length ? [...new Set(assocRockParts)].join(" · ") : undefined;

  const commodities = [clean(props.commod1), clean(props.commod2), clean(props.commod3)].filter(Boolean);
  const commodityList = commodities.length ? [...new Set(commodities)].join("; ") : undefined;

  const payload: any = {
    occurrence_name: clean(props.site) || clean(props.names) || row.occurrence_name,
    commodity: clean(props.commod1) || row.commodity,
    commodity_list: commodityList || row.commodity_list,
    commodity_codes: clean(props.code_list) || row.commodity_codes,
    mineralogy,
    deposit_type: clean(props.dep_type) || row.deposit_type,
    development_status: clean(props.dev_stat) || row.development_status,
    operation_type: clean(props.oper_type) || row.operation_type,
    geologic_model: clean(props.model) || row.geologic_model,
    host_rock: hostRock,
    associated_rock: associatedRock,
    production_size: clean(props.prod_size) || row.production_size,
    discovery_year: clean(props.disc_year) || clean(props.disc_yr) || row.discovery_year,
    record_type: clean(props.rec_tp) || row.record_type,
    mine_method: clean(props.min_meth) || row.mine_method,
    deposit_size: clean(props.deposit_size) || row.deposit_size,
    significant: clean(props.sig) || row.significant,
    commodity_type: clean(props.site_commod_type) || row.commodity_type,
    land_status: clean(props.land_st) || row.land_status,
    alternate_names: clean(props.names) || row.alternate_names,
    occurrence_state: state,
    occurrence_state_name: clean(props.state_prov) || stateName,
    occurrence_county: clean(props.county) || row.occurrence_county,
    latitude: coords ? coords[1] : row.latitude,
    longitude: coords ? coords[0] : row.longitude,
    source_url: clean(props.url) || row.source_url || `https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=${encodeURIComponent(mrdsId)}`,
    usgs_record_updated: clean(props.update_date) || row.usgs_record_updated,
    last_source_update: new Date().toISOString(),
    raw_usgs_json: `WFS enrichment: ${MRDS_SOURCE}, dep_id=${mrdsId}, updated=${clean(props.update_date) || "unknown"}`,
    notes: `${row.notes || ""}${row.notes ? " " : ""}Detailed fields enriched from USGS MRDS WFS (bulk).`,
  };
  for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
  return payload;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const state = String(body?.state || "TN").trim().toUpperCase();
    const bounds = STATE_BOUNDS[state];
    if (!bounds) return Response.json({ error: `Unsupported state: ${state}` }, { status: 400 });
    const stateName = bounds.name;
    const force = Boolean(body?.force);

    // 1. Load all MiningSites for this state (for match revalidation).
    const siteMap = new Map<string, any>();
    for (let sOff = 0; sOff < 20000; sOff += 500) {
      const page = await base44.asServiceRole.entities.MiningSite.filter({ state }, "created_date", 500, sOff);
      for (const s of page || []) siteMap.set(s.id, s);
      if (!page || page.length < 500) break;
    }

    // 2. Load all USGSMineralOccurrence records for this state.
    const allRows: any[] = [];
    for (let rOff = 0; rOff < 20000; rOff += 500) {
      const page = await base44.asServiceRole.entities.USGSMineralOccurrence.filter({
        $or: [{ occurrence_state: state }, { occurrence_state: stateName }, { occurrence_state_name: stateName }],
      }, "created_date", 500, rOff);
      allRows.push(...(page || []));
      if (!page || page.length < 500) break;
    }
    const rowByMrds = new Map<string, any>();
    for (const r of allRows) {
      const id = clean(r.mrds_id);
      if (id) rowByMrds.set(id, r);
    }

    // 3. Query the USGS MRDS WFS for the state bounding box (one request, no rate limit).
    const params = new URLSearchParams({
      service: "WFS", version: "1.0.0", request: "GetFeature",
      typeName: MRDS_LAYER,
      bbox: `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`,
      maxFeatures: "15000",
    });
    const wfsUrl = `${MRDS_WFS}?${params.toString()}`;
    const wfsResp = await fetch(wfsUrl, {
      headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" },
      signal: AbortSignal.timeout(120000),
    });
    if (!wfsResp.ok) throw new Error(`USGS MRDS WFS failed: ${wfsResp.status}`);
    const xml = await wfsResp.text();
    const features = parseGmlFeatures(xml);

    // Build a map: mrds_id → { properties, coordinates }
    const featureByMrds = new Map<string, { properties: Record<string, string>; coordinates: [number, number] | null }>();
    for (const f of features) {
      const id = clean(f.properties.dep_id);
      if (id) featureByMrds.set(id, f);
    }

    // 4. Match revalidation + WFS enrichment.
    let matchDowngrades = 0;
    let matchUpgrades = 0;
    let enriched = 0;
    let skippedAlreadyEnriched = 0;
    let notInWfs = 0;
    let withDepositType = 0;
    let withMineralogy = 0;
    let withHostRock = 0;
    let withProductionSize = 0;
    let withReferences = 0;
    const enrichedSiteIds = new Set<string>();
    const updates: any[] = [];
    const sample: any[] = [];

    for (const row of allRows) {
      const mrdsId = clean(row.mrds_id);
      if (!mrdsId) continue;

      // --- Match revalidation ---
      let matchUpdate: any = null;
      if (row.match_status === "matched") {
        const site = row.mining_site_id ? siteMap.get(row.mining_site_id) : null;
        if (!site) {
          matchUpdate = { id: row.id, match_status: "unmatched", match_method: null, mining_site_id: null, msha_mine_id: null, distance_meters: null };
          matchDowngrades++;
        } else {
          const result = revalidateMatched(row, site);
          if (result.changed) {
            matchUpdate = { id: row.id, match_status: result.status, match_method: result.method, distance_meters: result.dist };
            if (result.status !== "matched") {
              matchUpdate.mining_site_id = null;
              matchUpdate.msha_mine_id = null;
            }
            if (result.status === "matched" && row.match_status !== "matched") matchUpgrades++;
            else if (result.status !== "matched") matchDowngrades++;
          }
        }
      }

      // --- WFS enrichment ---
      let enrichmentUpdate: any = null;
      const feature = featureByMrds.get(mrdsId);
      if (feature) {
        if (!force && row.raw_usgs_json && row.raw_usgs_json.startsWith("WFS enrichment:")) {
          skippedAlreadyEnriched++;
        } else {
          const payload = buildEnrichmentPayload(feature.properties, feature.coordinates, state, stateName, row);
          enrichmentUpdate = { id: row.id, ...payload };
          enriched++;
          if (payload.deposit_type) withDepositType++;
          if (payload.mineralogy) withMineralogy++;
          if (payload.host_rock) withHostRock++;
          if (payload.production_size) withProductionSize++;
          if (row.references) withReferences++;
          if (row.mining_site_id) enrichedSiteIds.add(row.mining_site_id);
          if (sample.length < 12) sample.push({
            mrds_id: mrdsId,
            occurrence: payload.occurrence_name,
            commodity: payload.commodity,
            deposit_type: payload.deposit_type || null,
            operation_type: payload.operation_type || null,
            mineralogy: payload.mineralogy || null,
            host_rock: payload.host_rock || null,
            production_size: payload.production_size || null,
            match_status: matchUpdate?.match_status || row.match_status,
          });
        }
      } else {
        notInWfs++;
      }

      // Merge match update + enrichment update into one update.
      if (matchUpdate && enrichmentUpdate) {
        updates.push({ ...enrichmentUpdate, ...matchUpdate });
      } else if (matchUpdate) {
        updates.push(matchUpdate);
      } else if (enrichmentUpdate) {
        updates.push(enrichmentUpdate);
      }
    }

    // 5. Deduplicate updates by entity ID (a record may appear twice if the
    //    pagination overlap returns it on two pages) and bulk update in batches of 500.
    const updateById = new Map<string, any>();
    for (const u of updates) {
      if (u.id) updateById.set(u.id, { ...updateById.get(u.id), ...u });
    }
    const dedupedUpdates = [...updateById.values()];
    for (let i = 0; i < dedupedUpdates.length; i += 500) {
      const batch = dedupedUpdates.slice(i, i + 500);
      await base44.asServiceRole.entities.USGSMineralOccurrence.bulkUpdate(batch);
    }

    // 6. Compute final match status counts.
    let matchedHighConfidence = 0;
    let nearbyOnly = 0;
    let historical = 0;
    let unmatchedPotential = 0;
    for (const row of allRows) {
      if (matchDowngrades > 0 || matchUpgrades > 0) {
        // Re-read would be ideal, but we can compute from updates.
        // For simplicity, use the updates we just applied.
      }
      const status = updates.find((u) => u.id === row.id)?.match_status || row.match_status;
      if (status === "matched") matchedHighConfidence++;
      else if (status === "nearby") nearbyOnly++;
      else if (status === "historical") historical++;
      else unmatchedPotential++;
    }

    return Response.json({
      success: true,
      state,
      state_name: stateName,
      wfs_features: features.length,
      wfs_matched_to_records: featureByMrds.size,
      total_records: allRows.length,
      total_attempted: allRows.length,
      enriched,
      skipped_already_enriched: skippedAlreadyEnriched,
      not_in_wfs: notInWfs,
      failed: 0,
      with_deposit_type: withDepositType,
      with_mineralogy: withMineralogy,
      with_host_rock: withHostRock,
      with_production_size: withProductionSize,
      with_references: withReferences,
      matched_high_confidence: matchedHighConfidence,
      nearby_only: nearbyOnly,
      historical,
      unmatched_potential: unmatchedPotential,
      match_revalidations: matchDowngrades + matchUpgrades,
      match_downgrades: matchDowngrades,
      match_upgrades: matchUpgrades,
      unique_mining_sites_enriched: enrichedSiteIds.size,
      mining_sites_loaded: siteMap.size,
      updates_applied: updates.length,
      sample,
      note: "Bulk WFS enrichment: queries the USGS MRDS WFS once per state (no per-record rate limit) and updates all USGSMineralOccurrence records with mineralogy, deposit type, host rock, production size, discovery year, alternate names, and source metadata. Match revalidation downgrades generic name-only matches lacking coordinate or county corroboration. USGS data is additive — it never overwrites MSHA operator/controller, state permit, or parcel/ownership fields on MiningSite records. References and physiography fields require the JSON API (use mode=json for those).",
    });
  } catch (error: any) {
    console.error("enrich-usgs-mrds-details error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}