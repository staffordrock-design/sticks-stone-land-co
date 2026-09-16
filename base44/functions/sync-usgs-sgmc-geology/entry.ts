import { createClientFromRequest } from "npm:@base44/sdk";
import { deriveCommodityInterpretation, rockQualityTier } from "../../shared/rockTypes.js";

const SGMC_LAYER = "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/SGMC_featureservice/FeatureServer/0";
const SGMC_QUERY = `${SGMC_LAYER}/query`;
const SOURCE = "USGS State Geologic Map Compilation (SGMC)";
const SUPPORTED = new Set(["GA", "NC", "SC"]);

function validCoord(lat: unknown, lon: unknown) {
  const a = Number(lat), o = Number(lon);
  return Number.isFinite(a) && Number.isFinite(o) && a >= -90 && a <= 90 && o >= -180 && o <= 180;
}
function title(v: unknown) { const s = String(v || "").trim(); return s ? s.replace(/\b\w/g, (m) => m.toUpperCase()) : null; }

async function identify(state: string, lat: number, lon: number) {
  const p = new URLSearchParams({
    f: "json", where: `STATE = '${state}'`, geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint",
    inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: "STATE,ORIG_LABEL,SGMC_LABEL,UNIT_LINK,UNIT_NAME,AGE_MIN,AGE_MAX,MAJOR1,MAJOR2,MAJOR3,MINOR1,MINOR2,MINOR3,GENERALIZED_LITH,REFERENCE,DIGITAL_URL",
    returnGeometry: "false", resultRecordCount: "5",
  });
  const url = `${SGMC_QUERY}?${p}`;
  const resp = await fetch(url, { headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" }, signal: AbortSignal.timeout(25000) });
  if (!resp.ok) throw new Error(`USGS SGMC query failed: ${resp.status}`);
  const data = await resp.json(); if (data?.error) throw new Error(data.error?.message || "USGS SGMC query error");
  return { attrs: data?.features?.[0]?.attributes || null, url };
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const state = String(body?.state || "GA").trim().toUpperCase();
    if (!SUPPORTED.has(state)) return Response.json({ error: `Unsupported state: ${state}` }, { status: 400 });
    const limit = Math.min(Math.max(Number(body?.limit || 120), 1), 250);
    const sites: any[] = [];
    for (let skip = 0; skip < 10000; skip += 500) {
      const page = await base44.asServiceRole.entities.MiningSite.filter({ state }, "-updated_date", 500, skip);
      sites.push(...(page || [])); if (!page || page.length < 500) break;
    }
    const existing: any[] = [];
    for (let skip = 0; skip < 10000; skip += 500) {
      const page = await base44.asServiceRole.entities.GeologyRecord.filter({ state }, "-updated_date", 500, skip);
      existing.push(...(page || [])); if (!page || page.length < 500) break;
    }
    const bySite = new Map<string, any>();
    for (const r of existing) if (r.mining_site_id && r.source_agency === SOURCE) bySite.set(r.mining_site_id, r);
    const valid = sites.filter((s: any) => validCoord(s.latitude, s.longitude));
    const missing = valid.filter((s: any) => !bySite.has(s.id));
    const toProcess = (missing.length ? missing : valid).slice(0, limit);
    const now = new Date().toISOString();
    let queried = 0, matched = 0, created = 0, updated = 0, noMatch = 0;
    const sample: any[] = [], errors: any[] = [];
    for (const site of toProcess) {
      queried++;
      try {
        const { attrs, url } = await identify(state, Number(site.latitude), Number(site.longitude));
        if (!attrs) { noMatch++; continue; }
        matched++;
        const primaryRock = title(attrs.MAJOR1 || attrs.GENERALIZED_LITH);
        const secondaryRock = title(attrs.MAJOR2 || attrs.MINOR1);
        const lithology = [attrs.GENERALIZED_LITH, attrs.MAJOR1, attrs.MAJOR2, attrs.MINOR1].filter(Boolean).map(title).filter(Boolean).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i).join(" / ") || null;
        const interpretation = deriveCommodityInterpretation({ primary: primaryRock, secondary: secondaryRock, siteCommodity: site.commodity || null });
        const tier = rockQualityTier(primaryRock, secondaryRock);
        const age = [attrs.AGE_MIN, attrs.AGE_MAX].filter(Boolean).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i).join("–") || null;
        const record: any = {
          mining_site_id: site.id, msha_mine_id: site.msha_mine_id || null, parcel_id: site.parcel_id || null,
          mine_name: site.mine_name || `Mine ${site.msha_mine_id || site.id}`, state, county: site.county || null,
          primary_rock: primaryRock, secondary_rock: secondaryRock, geologic_unit: attrs.SGMC_LABEL || attrs.ORIG_LABEL || null,
          formation_name: attrs.UNIT_NAME || null, geologic_age: age, lithology,
          commodity_interpretation: interpretation, confidence: tier ? "High" : attrs.UNIT_NAME ? "Medium" : "Low",
          source_agency: SOURCE, source_url: attrs.DIGITAL_URL || url, source_map_layer: "SGMC_Geology",
          last_source_update: now,
          notes: `Point-in-polygon match against the USGS SGMC national state-geology compilation at ${Number(site.latitude).toFixed(6)}, ${Number(site.longitude).toFixed(6)}. Unit: ${attrs.UNIT_NAME || attrs.SGMC_LABEL || attrs.ORIG_LABEL || "—"}. Reference: ${attrs.REFERENCE || "USGS SGMC"}. This is regional mapped geology for screening, not drilling, reserve estimation, laboratory aggregate testing, or proof of economic recoverability.`,
        };
        const prior = bySite.get(site.id) || (await base44.asServiceRole.entities.GeologyRecord.filter({ mining_site_id: site.id, state }, "-updated_date", 10, 0))?.find((r: any) => r.source_agency === SOURCE);
        if (prior) { await base44.asServiceRole.entities.GeologyRecord.update(prior.id, record); updated++; }
        else { await base44.asServiceRole.entities.GeologyRecord.create(record); created++; }
        if (sample.length < 12) sample.push({ mine: site.mine_name, county: site.county, primaryRock, secondaryRock, unit: record.formation_name, age, category: interpretation });
      } catch (e: any) { errors.push({ site_id: site.id, mine: site.mine_name, error: e?.message || String(e) }); }
    }
    return Response.json({ success: true, state, source: SGMC_LAYER, queried, matched, no_match: noMatch, created, updated, errors: errors.slice(0,25), sample, note: "USGS SGMC is a standardized regional geology layer. It supports lithology screening but is not a reserve or aggregate-quality determination." });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
