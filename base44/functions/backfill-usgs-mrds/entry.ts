import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

const MRDS_WFS = "https://mrdata.usgs.gov/services/wfs/mrds";
const MRDS_LAYER = "mrds";
const MRDS_SOURCE = "USGS Mineral Resources Data System (MRDS) — Tennessee quarry backfill";

function validCoord(lat: unknown, lon: unknown) {
  const a = Number(lat);
  const o = Number(lon);
  return Number.isFinite(a) && Number.isFinite(o) && a >= -90 && a <= 90 && o >= -180 && o <= 180;
}

function clean(v: unknown) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
}

function isQuarryRelevant(site: any) {
  const commodity = String(site?.commodity || "").toLowerCase().trim();
  const name = String(site?.mine_name || "").toLowerCase();
  const haystack = `${commodity} ${name}`;
  if (haystack.includes("coal")) return false;
  if (!commodity) return /quarry|stone|sand|gravel|aggregate|limestone|dolomite|granite|marble|slate|shale|clay|rock|lime/.test(name);
  return ["stone", "limestone", "sand", "gravel", "aggregate", "marble", "granite", "slate", "shale", "quartz", "clay", "dolomite", "rock", "lime"]
    .some((term) => haystack.includes(term));
}

function uniqueText(values: unknown[], separator = "; ") {
  return [...new Set(values.map(clean).filter(Boolean) as string[])].join(separator) || null;
}

function mineralogyFrom(props: Record<string, string>) {
  const parts = [
    clean(props.ore) ? `Ore: ${clean(props.ore)}` : null,
    clean(props.gangue) ? `Gangue: ${clean(props.gangue)}` : null,
    clean(props.other_matl) ? `Other material: ${clean(props.other_matl)}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || null;
}

function rockDescription(unit: unknown, type: unknown) {
  const values = [clean(unit), clean(type)].filter(Boolean) as string[];
  return [...new Set(values)].join(" · ") || null;
}

function discoveryYear(props: Record<string, string>) {
  return clean(props.disc_year) || clean(props.disc_yr) || clean(props.year_disc) || clean(props.yr_disc) || null;
}

function contextNotes(props: Record<string, string>, distance: number, mrdsId: string) {
  const details = [
    `USGS MRDS occurrence matched by proximity (${distance} m from mine site).`,
    `MRDS dep_id: ${mrdsId}.`,
    clean(props.work_type) ? `Work type: ${clean(props.work_type)}.` : null,
    clean(props.names) ? `Other names: ${clean(props.names)}.` : null,
    clean(props.ore_ctrl) ? `Ore control: ${clean(props.ore_ctrl)}.` : null,
    clean(props.alteration) ? `Alteration: ${clean(props.alteration)}.` : null,
    clean(props.structure) ? `Structure: ${clean(props.structure)}.` : null,
    clean(props.tectonic) ? `Tectonic setting: ${clean(props.tectonic)}.` : null,
    clean(props.ref) ? `USGS reference: ${clean(props.ref)}.` : null,
  ].filter(Boolean);
  return details.join(" ");
}

async function loadAllOccurrences(base44: any, maxRecords = 10000) {
  const rows: any[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < maxRecords; offset += pageSize) {
    const page = await base44.asServiceRole.entities.USGSMineralOccurrence.list("created_date", pageSize, offset);
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
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
    // Extract point coordinates from <gml:Point> specifically (not the <gml:Box> bounding box).
    const pointMatch = block.match(/<gml:Point[^>]*>\s*<gml:coordinates>([^<]+)<\/gml:coordinates>\s*<\/gml:Point>/);
    let coordinates: [number, number] | null = null;
    if (pointMatch) {
      const parts = pointMatch[1].trim().split(/[,\s]+/);
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) coordinates = [lon, lat];
    }
    return { properties: props, coordinates };
  });
}

async function fetchMrdsNear(lat: number, lon: number, radiusDeg = 0.08) {
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
    // Scheduled/service invocations have no end-user session. Match the other
    // public-source enrichment jobs: allow service/no-user calls, but reject a
    // signed-in non-admin caller.
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 40, 1), 100);
    const offset = Math.max(Number(body?.offset) || 0, 0);
    const state = String(body?.state || "TN").trim().toUpperCase();

    // Walk the state mine set in a stable order. Offset advances across *all* rows,
    // including records without coordinates, so repeated admin runs eventually scan
    // the full state instead of repeatedly touching only the newest 500 records.
    const sites = await base44.asServiceRole.entities.MiningSite.filter({ state }, "created_date", limit, offset);
    const quarryRows = (sites || []).filter((s: any) => isQuarryRelevant(s));
    const candidates = quarryRows.filter((s: any) => validCoord(s.latitude, s.longitude));

    // Load every existing linkage so this sync can update/backfill older sparse MRDS
    // records instead of permanently skipping them after the first proximity match.
    const existing = await loadAllOccurrences(base44);
    const existingBySiteId = new Map((existing || []).filter((r: any) => r.mining_site_id).map((r: any) => [r.mining_site_id, r]));

    const toProcess = candidates;

    let queried = 0;
    let matched = 0;
    let created = 0;
    let updated = 0;
    let noCoordinates = quarryRows.length - candidates.length;
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
            const coords = f?.coordinates || [];
            const lon = Number(coords[0]);
            const lat = Number(coords[1]);
            const dist = Number.isFinite(lat) && Number.isFinite(lon)
              ? haversineMeters(Number(site.latitude), Number(site.longitude), lat, lon)
              : 999999;
            return { feature: f, dist };
          })
          .sort((a: any, b: any) => a.dist - b.dist);

        const closest = withDistance[0];
        if (!closest || closest.dist > 10000) {
          noMatch++;
          continue;
        }

        matched++;
        const props = closest.feature?.properties || {};
        const mrdsId = clean(props.dep_id) || `MRDS-${site.id}`;
        const coords = closest.feature?.coordinates || [];
        const occLon = Number(coords[0]);
        const occLat = Number(coords[1]);
        const commodityList = uniqueText([props.commod1, props.commod2, props.commod3]);
        const codeList = clean(props.code_list);

        const record = {
          mining_site_id: site.id,
          msha_mine_id: site.msha_mine_id || null,
          mrds_id: mrdsId,
          occurrence_name: clean(props.site) || clean(props.names) || site.mine_name || "USGS occurrence",
          commodity: clean(props.commod1) || commodityList || site.commodity || null,
          commodity_list: commodityList || codeList,
          mineralogy: mineralogyFrom(props),
          deposit_type: clean(props.dep_type),
          development_status: clean(props.dev_stat),
          operation_type: clean(props.oper_type),
          geologic_model: clean(props.model),
          host_rock: rockDescription(props.hrock_unit, props.hrock_type),
          associated_rock: rockDescription(props.arock_unit, props.arock_type),
          production_size: clean(props.prod_size),
          discovery_year: discoveryYear(props),
          occurrence_state: site.state || null,
          occurrence_county: site.county || null,
          latitude: Number.isFinite(occLat) ? occLat : null,
          longitude: Number.isFinite(occLon) ? occLon : null,
          distance_meters: closest.dist,
          source_url: clean(props.url) || `https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=${encodeURIComponent(mrdsId)}`,
          last_source_update: new Date().toISOString(),
          notes: contextNotes(props, closest.dist, mrdsId),
        };

        const prior = existingBySiteId.get(site.id);
        if (prior?.id) {
          await base44.asServiceRole.entities.USGSMineralOccurrence.update(prior.id, record);
          updated++;
        } else {
          const createdRecord = await base44.asServiceRole.entities.USGSMineralOccurrence.create(record);
          created++;
          existingBySiteId.set(site.id, createdRecord || record);
        }

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
      state,
      offset,
      source_rows: (sites || []).length,
      quarry_rows: quarryRows.length,
      candidates: candidates.length,
      existing_records_scanned: existing.length,
      processed: toProcess.length,
      queried,
      matched,
      created,
      updated,
      no_coordinates: noCoordinates,
      noMatch,
      errors,
      next_offset: offset + (sites || []).length,
      has_more: (sites || []).length === limit,
      sample,
      note: "USGS MRDS occurrences are matched by proximity to each mine's coordinates (within 10 km). The sync now preserves USGS commodity names, mineralogy, deposit type, operation type, geologic model, host/associated rock and production-size fields, and refreshes earlier sparse links instead of skipping them.",
    });
  } catch (error: any) {
    console.error("sync-usgs-mrds error", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}