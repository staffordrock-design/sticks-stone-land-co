import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

const MRDS_WFS = "https://mrdata.usgs.gov/services/wfs/mrds";
const MRDS_LAYER = "mrds";
const MRDS_SOURCE = "USGS Mineral Resources Data System (MRDS)";

function validCoord(lat: unknown, lon: unknown) {
  const a = Number(lat);
  const o = Number(lon);
  return Number.isFinite(a) && Number.isFinite(o) && a >= -90 && a <= 90 && o >= -180 && o <= 180;
}

function clean(v: unknown) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
}

// Haversine distance in meters between two lat/lng points.
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// Parse GML2 feature members from the WFS response into { properties, coordinates } objects.
function parseGmlFeatures(xml: string) {
  const members = [...xml.matchAll(/<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g)];
  return members.map((m) => {
    const block = m[1];
    const props: Record<string, string> = {};
    // Extract all <ms:FIELD_NAME>value</ms:FIELD_NAME> property elements.
    const propMatches = [...block.matchAll(/<ms:(\w+)>([^<]*)<\/ms:\w+>/g)];
    for (const pm of propMatches) {
      props[pm[1]] = pm[2].trim();
    }
    // Extract point coordinates (lon,lat).
    const coordMatch = block.match(/<gml:coordinates>([^<]+)<\/gml:coordinates>/);
    let coordinates: [number, number] | null = null;
    if (coordMatch) {
      const [lon, lat] = coordMatch[1].split(",").map(Number);
      if (Number.isFinite(lon) && Number.isFinite(lat)) coordinates = [lon, lat];
    }
    return { properties: props, coordinates };
  });
}

async function fetchMrdsNear(lat: number, lon: number, radiusDeg = 0.05) {
  const minLat = lat - radiusDeg;
  const maxLat = lat + radiusDeg;
  const minLon = lon - radiusDeg;
  const maxLon = lon + radiusDeg;
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: MRDS_LAYER,
    bbox: `${minLon},${minLat},${maxLon},${maxLat}`,
  });
  const url = `${MRDS_WFS}?${params.toString()}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`USGS MRDS WFS failed: ${resp.status}`);
  const xml = await resp.text();
  return parseGmlFeatures(xml);
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit) || 40, 200);

    // Load mining sites that have coordinates but no USGS occurrence linked yet.
    const sites = await base44.asServiceRole.entities.MiningSite.list("-updated_date", 500);
    const candidates = (sites || []).filter(
      (s: any) => validCoord(s.latitude, s.longitude)
    );

    // Check which sites already have a USGS occurrence so we can skip them.
    const existing = await base44.asServiceRole.entities.USGSMineralOccurrence.list("-updated_date", 500);
    const linkedSiteIds = new Set((existing || []).map((r: any) => r.mining_site_id).filter(Boolean));

    const toProcess = candidates.filter((s: any) => !linkedSiteIds.has(s.id)).slice(0, limit);

    let queried = 0;
    let matched = 0;
    let created = 0;
    let noMatch = 0;
    let errors = 0;
    const sample: any[] = [];

    for (const site of toProcess) {
      queried++;
      try {
        const features = await fetchMrdsNear(Number(site.latitude), Number(site.longitude));
        if (!features.length) {
          noMatch++;
          continue;
        }

        // Sort by distance to the mine site and take the closest.
        const withDistance = features
          .map((f: any) => {
            const coords = f?.geometry?.coordinates || [];
            const lon = Number(coords[0]);
            const lat = Number(coords[1]);
            const dist = Number.isFinite(lat) && Number.isFinite(lon)
              ? haversineMeters(Number(site.latitude), Number(site.longitude), lat, lon)
              : 999999;
            return { feature: f, dist };
          })
          .sort((a: any, b: any) => a.dist - b.dist);

        const closest = withDistance[0];
        if (!closest || closest.dist > 5000) {
          noMatch++;
          continue;
        }

        matched++;
        const props = closest.feature?.properties || {};
        const mrdsId = clean(props.dep_id) || clean(props.MRDS_ID) || `MRDS-${site.id}`;
        const coords = closest.feature?.geometry?.coordinates || [];
        const occLon = Number(coords[0]);
        const occLat = Number(coords[1]);

        const record = {
          mining_site_id: site.id,
          msha_mine_id: site.msha_mine_id || null,
          mrds_id: mrdsId,
          occurrence_name: clean(props.name) || clean(props.NAME) || site.mine_name || "USGS occurrence",
          commodity: clean(props.commodity) || clean(props.COMMODITY) || site.commodity || null,
          commodity_list: clean(props.commod1) || clean(props.COMMOD1) || clean(props.commodity_list) || null,
          mineralogy: clean(props.ore_list) || clean(props.ORE_LIST) || null,
          deposit_type: clean(props.dep_type) || clean(props.DEP_TYPE) || null,
          development_status: clean(props.dev_stat) || clean(props.DEV_STAT) || null,
          operation_type: clean(props.oper_type) || clean(props.OPER_TYPE) || null,
          geologic_model: clean(props.model) || clean(props.MODEL) || null,
          host_rock: clean(props.hrock_type) || clean(props.HROCK_TYPE) || null,
          associated_rock: clean(props.arock_type) || clean(props.AROCK_TYPE) || null,
          production_size: clean(props.prod_size) || clean(props.PROD_SIZE) || null,
          discovery_year: clean(props.year) || clean(props.YEAR) || null,
          occurrence_state: clean(props.state) || clean(props.STATE) || site.state || null,
          occurrence_county: clean(props.county) || clean(props.COUNTY) || site.county || null,
          latitude: Number.isFinite(occLat) ? occLat : null,
          longitude: Number.isFinite(occLon) ? occLon : null,
          distance_meters: closest.dist,
          source_url: `https://mrdata.usgs.gov/mrds/show-${encodeURIComponent(mrdsId)}`,
          last_source_update: new Date().toISOString(),
          notes: `USGS MRDS occurrence matched by proximity (${closest.dist} m from mine site). MRDS dep_id: ${mrdsId}.`,
        };

        await base44.asServiceRole.entities.USGSMineralOccurrence.create(record);
        created++;

        if (sample.length < 12) {
          sample.push({
            mine: site.mine_name,
            msha: site.msha_mine_id || null,
            occurrence: record.occurrence_name,
            mrds_id: mrdsId,
            commodity: record.commodity,
            deposit_type: record.deposit_type,
            dev_status: record.development_status,
            distance_m: closest.dist,
          });
        }
      } catch (e: any) {
        console.error("USGS MRDS lookup failed for", site.id, e?.message || e);
        errors++;
      }
    }

    return Response.json({
      success: true,
      source: MRDS_SOURCE,
      candidates: candidates.length,
      already_linked: linkedSiteIds.size,
      processed: toProcess.length,
      queried,
      matched,
      created,
      noMatch,
      errors,
      sample,
      note: "USGS MRDS occurrences are matched by proximity to each mine's coordinates (within 5 km). MRDS is the USGS Mineral Resources Data System — a global database of mineral deposits and mines.",
    });
  } catch (error: any) {
    console.error("sync-usgs-mrds error", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}