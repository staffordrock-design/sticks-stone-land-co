import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  MRDS_WFS, MRDS_LAYER, MRDS_SOURCE,
  clean, validCoord, haversineMeters, isQuarryRelevantByCode,
  normalizeName, nameMatch, parseGmlFeatures, buildGrid, findNearestSite, findByNameMatch,
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

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const state = String(body?.state || "TN").trim().toUpperCase();
    const bounds = STATE_BOUNDS[state];
    if (!bounds) {
      return Response.json({ error: `Unsupported state: ${state}` }, { status: 400 });
    }

    // 1. Fetch USGS MRDS WFS for the state bounding box.
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName: MRDS_LAYER,
      bbox: `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`,
      maxFeatures: "10000",
    });
    const wfsUrl = `${MRDS_WFS}?${params.toString()}`;
    const wfsResp = await fetch(wfsUrl, {
      headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" },
      signal: AbortSignal.timeout(60000),
    });
    if (!wfsResp.ok) throw new Error(`USGS MRDS WFS failed: ${wfsResp.status}`);
    const xml = await wfsResp.text();
    const features = parseGmlFeatures(xml);

    // 2. Filter for quarry-relevant records.
    const quarryFeatures = features.filter((f) => {
      const codeList = clean(f.properties.code_list) || "";
      const siteName = clean(f.properties.site_name) || "";
      return isQuarryRelevantByCode(codeList, siteName);
    });

    // 3. Load existing USGSMineralOccurrence records for this state (by mrds_id).
    const existingByMrds = new Map<string, any>();
    for (let offset = 0; offset < 10000; offset += 500) {
      const page = await base44.asServiceRole.entities.USGSMineralOccurrence.filter(
        { occurrence_state: state },
        "created_date",
        500,
        offset,
      );
      for (const r of page || []) {
        if (r.mrds_id) existingByMrds.set(String(r.mrds_id).trim(), r);
      }
      if (!page || page.length < 500) break;
    }

    // 4. Load all MiningSites for this state with valid coordinates.
    const allSites: any[] = [];
    for (let offset = 0; offset < 20000; offset += 500) {
      const page = await base44.asServiceRole.entities.MiningSite.filter(
        { state },
        "created_date",
        500,
        offset,
      );
      allSites.push(...(page || []));
      if (!page || page.length < 500) break;
    }
    const sitesWithCoords = allSites.filter((s) => validCoord(s.latitude, s.longitude));
    const gridData = buildGrid(sitesWithCoords, 0.01);

    // 5. Match each USGS record to a MiningSite.
    const now = new Date().toISOString();
    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    let matched = 0;
    let nearby = 0;
    let unmatched = 0;
    let historical = 0;
    let updatedExisting = 0;
    let createdNew = 0;
    let withCommodity = 0;
    let withCoords = 0;
    const sample: any[] = [];

    for (const f of quarryFeatures) {
      const props = f.properties;
      const mrdsId = clean(props.dep_id);
      if (!mrdsId) continue;
      const siteName = clean(props.site_name) || `MRDS ${mrdsId}`;
      const devStat = clean(props.dev_stat) || null;
      const codeList = clean(props.code_list) || null;
      const coords = f.coordinates;
      const occLon = coords ? coords[0] : null;
      const occLat = coords ? coords[1] : null;
      const sourceUrl = clean(props.url) || `https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=${encodeURIComponent(mrdsId)}`;

      if (codeList) withCommodity++;
      if (validCoord(occLat, occLon)) withCoords++;

      // --- Matching logic (conservative, per user spec) ---
      let matchedSite: any = null;
      let matchMethod: string | null = null;
      let matchDist: number | null = null;

      // Try coordinate match: within 500m of a MiningSite.
      if (validCoord(occLat, occLon)) {
        const nearest = findNearestSite(occLat!, occLon!, gridData, 500);
        if (nearest) {
          matchedSite = nearest.site;
          matchMethod = "coordinate";
          matchDist = nearest.dist;
        }
      }

      // Try name match if coordinate match didn't find one.
      if (!matchedSite) {
        const found = findByNameMatch(siteName, sitesWithCoords);
        if (found) {
          matchedSite = found;
          matchMethod = "name";
        }
      }

      // Determine match status.
      let matchStatus: string;
      let miningSiteId: string | null = null;
      let mshaMineId: string | null = null;

      if (matchedSite) {
        matchStatus = "matched";
        miningSiteId = matchedSite.id;
        mshaMineId = matchedSite.msha_mine_id || null;
        matched++;
      } else if (validCoord(occLat, occLon)) {
        const nearest2k = findNearestSite(occLat!, occLon!, gridData, 2000);
        if (nearest2k) {
          matchStatus = "nearby";
          matchDist = nearest2k.dist;
          nearby++;
        } else if (devStat === "Past Producer") {
          matchStatus = "historical";
          historical++;
        } else {
          matchStatus = "unmatched";
          unmatched++;
        }
      } else if (devStat === "Past Producer") {
        matchStatus = "historical";
        historical++;
      } else {
        matchStatus = "unmatched";
        unmatched++;
      }

      // Build the record payload.
      const record: any = {
        mrds_id: mrdsId,
        occurrence_name: siteName,
        commodity: codeList,
        commodity_codes: codeList,
        commodity_list: codeList,
        development_status: devStat,
        occurrence_state: state,
        occurrence_state_name: bounds.name,
        latitude: occLat != null ? Number(occLat) : undefined,
        longitude: occLon != null ? Number(occLon) : undefined,
        match_status: matchStatus,
        match_method: matchMethod || undefined,
        mining_site_id: miningSiteId || undefined,
        msha_mine_id: mshaMineId || undefined,
        distance_meters: matchDist ?? undefined,
        source_url: sourceUrl,
        last_source_update: now,
        notes: `USGS MRDS occurrence imported from WFS. Development status: ${devStat || "Unknown"}. Commodity codes: ${codeList || "None"}.`,
      };

      // Remove undefined/null values.
      for (const key of Object.keys(record)) {
        if (record[key] === undefined || record[key] === null) delete record[key];
      }

      // Check if this record already exists (by mrds_id).
      const existing = existingByMrds.get(mrdsId);
      if (existing) {
        toUpdate.push({
          id: existing.id,
          ...record,
          // Preserve enriched fields from the JSON API that the WFS doesn't provide.
          mineralogy: existing.mineralogy || undefined,
          deposit_type: existing.deposit_type || undefined,
          operation_type: existing.operation_type || undefined,
          geologic_model: existing.geologic_model || undefined,
          host_rock: existing.host_rock || undefined,
          associated_rock: existing.associated_rock || undefined,
          production_size: existing.production_size || undefined,
          discovery_year: existing.discovery_year || undefined,
          record_type: existing.record_type || undefined,
          mine_method: existing.mine_method || undefined,
          deposit_size: existing.deposit_size || undefined,
          significant: existing.significant || undefined,
          commodity_type: existing.commodity_type || undefined,
          land_status: existing.land_status || undefined,
          physiographic_division: existing.physiographic_division || undefined,
          physiographic_province: existing.physiographic_province || undefined,
          physiographic_section: existing.physiographic_section || undefined,
          elevation_m: existing.elevation_m ?? undefined,
          point_reference: existing.point_reference || undefined,
          alternate_names: existing.alternate_names || undefined,
          references: existing.references || undefined,
          source_database: existing.source_database || undefined,
          usgs_record_updated: existing.usgs_record_updated || undefined,
          raw_usgs_json: existing.raw_usgs_json || undefined,
          occurrence_county: existing.occurrence_county || undefined,
        });
        updatedExisting++;
      } else {
        toCreate.push(record);
        createdNew++;
      }

      if (sample.length < 12) {
        sample.push({
          mrds_id: mrdsId,
          name: siteName,
          dev_stat: devStat,
          codes: codeList,
          match_status: matchStatus,
          match_method: matchMethod,
          mining_site: matchedSite?.mine_name || null,
          distance_m: matchDist,
        });
      }
    }

    // 6. Bulk create new records.
    for (let i = 0; i < toCreate.length; i += 500) {
      const batch = toCreate.slice(i, i + 500);
      await base44.asServiceRole.entities.USGSMineralOccurrence.bulkCreate(batch);
    }

    // 7. Bulk update existing records.
    for (let i = 0; i < toUpdate.length; i += 500) {
      const batch = toUpdate.slice(i, i + 500);
      await base44.asServiceRole.entities.USGSMineralOccurrence.bulkUpdate(batch);
    }

    return Response.json({
      success: true,
      source: MRDS_SOURCE,
      state,
      state_name: bounds.name,
      wfs_features_total: features.length,
      quarry_relevant: quarryFeatures.length,
      existing_records: existingByMrds.size,
      created: createdNew,
      updated: updatedExisting,
      matched,
      nearby,
      unmatched,
      historical,
      with_commodity: withCommodity,
      with_coords: withCoords,
      mining_sites_loaded: allSites.length,
      mining_sites_with_coords: sitesWithCoords.length,
      sample,
      note: "USGS MRDS occurrences imported from WFS for the full state bounding box. Quarry-relevant records are filtered by commodity code and site name. Matching is conservative: coordinate match within 500m, or strong name match. Unmatched occurrences are retained as potential/historical mineral sites. Detailed mineralogy, deposit type and host rock are enriched separately via enrich-usgs-mrds-details.",
    });
  } catch (error: any) {
    console.error("sync-usgs-mrds-southeast error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}