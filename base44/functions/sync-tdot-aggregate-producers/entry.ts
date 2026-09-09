import { createClientFromRequest } from "npm:@base44/sdk";

const TDOT_LAYER = "https://spatial.tdot.tn.gov/ArcGIS/rest/services/Materials_and_Tests/Producer_List_Plants/FeatureServer/0";
const TDOT_SOURCE = "https://www.tn.gov/tdot/materials-and-tests/producer-list.html";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(incorporated|inc|llc|ltd|corp|corporation|company|co|quarry|mine|mining|aggregates?|stone|rock|plant)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: unknown) {
  return new Set(normalizedName(value).split(" ").filter((x) => x.length > 2));
}

function similarity(a: unknown, b: unknown) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection += 1;
  return intersection / Math.max(A.size, B.size);
}

function miles(lat1: unknown, lon1: unknown, lat2: unknown, lon2: unknown) {
  const a = Number(lat1), b = Number(lon1), c = Number(lat2), d = Number(lon2);
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const rad = (x: number) => x * Math.PI / 180;
  const R = 3958.7613;
  const dLat = rad(c - a);
  const dLon = rad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function allTennesseeSites(base44: any) {
  const rows: any[] = [];
  for (let offset = 0; offset <= 10000; offset += 500) {
    const page = await base44.asServiceRole.entities.MiningSite.filter({ state: "TN" }, "-updated_date", 500, offset);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

function bestMiningSiteMatch(producer: any, sites: any[]) {
  const county = clean(producer.COUNTY).toLowerCase();
  const producerName = producer.PRODUCER_SUPPLIER_NAME;
  let best: any = null;

  for (const site of sites) {
    const distance = miles(producer.LATITUDE, producer.LONGITUDE, site.latitude, site.longitude);
    const sameCounty = county && clean(site.county).toLowerCase() === county;
    const mineSim = similarity(producerName, site.mine_name);
    const operatorSim = similarity(producerName, site.operator_name);
    const nameSim = Math.max(mineSim, operatorSim);

    let score = 0;
    let method = "";
    let confidence: "Low" | "Medium" | "High" = "Low";

    if (nameSim >= 0.85 && distance != null && distance <= 10) {
      score = 100 - Math.min(distance, 10);
      method = "name+location";
      confidence = "High";
    } else if (distance != null && distance <= 1.5 && sameCounty) {
      score = 90 - distance;
      method = "location+county";
      confidence = "High";
    } else if (nameSim >= 0.6 && sameCounty) {
      score = 82 + nameSim * 10 - Math.min(distance ?? 10, 10) / 2;
      method = "name+county";
      confidence = "Medium";
    } else if (distance != null && distance <= 5 && sameCounty) {
      score = 70 - distance;
      method = "nearby+county";
      confidence = "Medium";
    } else {
      continue;
    }

    if (!best || score > best.score) best = { site, distance, score, method, confidence };
  }

  return best;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const params = new URLSearchParams({
      where: "PLANT_TYPE_CODE='AGGR' AND STATE='TN'",
      outFields: "PRODUCER_SUPPLIER_CODE,PRODUCER_SUPPLIER_NAME,PLANT_TYPE_CODE,PLANT_TYPE_DESCRIPTION,STATUS,STREET,CITY,STATE,ZIP,REGION,COUNTY,LATITUDE,LONGITUDE,OBJECTID",
      returnGeometry: "false",
      f: "json",
    });
    const sourceUrl = `${TDOT_LAYER}/query?${params.toString()}`;
    const response = await fetch(sourceUrl, { headers: { "User-Agent": "SSRockHoldings/1.0" } });
    if (!response.ok) throw new Error(`TDOT producer service failed: ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.error?.message || "TDOT producer service returned an error");

    const features = Array.isArray(payload?.features) ? payload.features : [];
    const sites = await allTennesseeSites(base44);
    const now = new Date().toISOString();
    let created = 0, updated = 0, matched = 0, highConfidence = 0;

    for (const feature of features) {
      const a = feature?.attributes || {};
      if (!clean(a.PRODUCER_SUPPLIER_NAME)) continue;
      const match = bestMiningSiteMatch(a, sites);
      if (match) {
        matched += 1;
        if (match.confidence === "High") highConfidence += 1;
      }

      const record = {
        tdot_object_id: Number(a.OBJECTID),
        producer_code: clean(a.PRODUCER_SUPPLIER_CODE),
        producer_name: clean(a.PRODUCER_SUPPLIER_NAME),
        plant_type_code: clean(a.PLANT_TYPE_CODE) || "AGGR",
        plant_type_description: clean(a.PLANT_TYPE_DESCRIPTION) || "Aggregate",
        status: clean(a.STATUS),
        street: clean(a.STREET),
        city: clean(a.CITY),
        state: clean(a.STATE) || "TN",
        zip: clean(a.ZIP),
        region: clean(a.REGION),
        county: clean(a.COUNTY),
        latitude: Number.isFinite(Number(a.LATITUDE)) ? Number(a.LATITUDE) : undefined,
        longitude: Number.isFinite(Number(a.LONGITUDE)) ? Number(a.LONGITUDE) : undefined,
        matched_mining_site_id: match?.site?.id || "",
        matched_msha_mine_id: match?.site?.msha_mine_id || "",
        matched_mine_name: match?.site?.mine_name || "",
        match_method: match?.method || "",
        match_distance_miles: match?.distance == null ? undefined : Number(match.distance.toFixed(2)),
        match_confidence: match?.confidence || undefined,
        source_url: TDOT_SOURCE,
        last_source_update: now,
      };

      const existing = await base44.asServiceRole.entities.TDOTProducerPlant.filter({ tdot_object_id: Number(a.OBJECTID) }, "-updated_date", 1, 0);
      if (existing?.[0]) {
        await base44.asServiceRole.entities.TDOTProducerPlant.update(existing[0].id, record);
        updated += 1;
      } else {
        await base44.asServiceRole.entities.TDOTProducerPlant.create(record);
        created += 1;
      }
    }

    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Data",
        related_entity_id: "sync-tdot-aggregate-producers",
        status: "Completed",
        summary: `TDOT aggregate producer sync: ${features.length} Tennessee aggregate plants refreshed; ${matched} matched to MiningSite records (${highConfidence} high-confidence).`,
        occurred_at: now,
      });
    } catch (_) {
      try {
        await base44.asServiceRole.entities.OperationsEvent.create({
          event_type: "Report",
          related_entity_id: "sync-tdot-aggregate-producers",
          status: "Completed",
          summary: `TDOT aggregate producer sync: ${features.length} Tennessee aggregate plants refreshed; ${matched} matched to MiningSite records (${highConfidence} high-confidence).`,
          occurred_at: now,
        });
      } catch (_) {}
    }

    return Response.json({
      success: true,
      source: TDOT_SOURCE,
      refreshed: features.length,
      created,
      updated,
      matched,
      highConfidence,
      note: "TDOT producer approval/status is not quarry production tonnage. It is a separate market/qualification signal.",
    });
  } catch (error: any) {
    console.error("sync-tdot-aggregate-producers error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
