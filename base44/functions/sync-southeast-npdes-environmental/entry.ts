import { createClientFromRequest } from "npm:@base44/sdk";

const EPA_CWA_LAYER = "https://echogeo.epa.gov/arcgis/rest/services/ECHO/Facilities/MapServer/2";
const EPA_CWA_QUERY = `${EPA_CWA_LAYER}/query`;
const SUPPORTED = new Set(["GA", "NC", "SC"]);
const STATE_NAME: Record<string, string> = { GA: "Georgia", NC: "North Carolina", SC: "South Carolina" };
const FIELDS = ["SOURCE_ID","REGISTRY_ID","CWP_NAME","CWP_STATE","CWP_COUNTY","CWP_STATUS","CWP_PERMIT_STATUS_DESC","CWP_PERMIT_TYPE_DESC","CWP_EXPIRATION_DATE","CWP_CURRENT_SNC_STATUS","CWP_SNC_EVENT_DESC","CWP_QTRS_IN_NC","CWP_CURRENT_VIOL","CWP_INSPECTION_COUNT","CWP_DATE_LAST_INSPECTION","CWP_FORMAL_EA_CNT","CWP_DATE_LAST_FEA","CWP_INFORMAL_ENF_ACT_COUNT","CWP_DATE_LAST_INFORMAL_EA","FAC_LAT","FAC_LONG"];

function norm(v: unknown) { return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function words(v: unknown) {
  const stop = new Set(["llc","inc","company","co","corp","corporation","quarry","mine","mines","plant","the","and"]);
  return new Set(norm(v).split(/\s+/).filter((t) => t.length > 2 && !stop.has(t)));
}
function similarity(a: unknown, b: unknown) {
  const aa = words(a), bb = words(b); if (!aa.size || !bb.size) return 0;
  let hit = 0; for (const t of aa) if (bb.has(t)) hit++;
  return hit / Math.max(aa.size, bb.size);
}
function distanceKm(a: number, b: number, c: number, d: number) {
  const R = 6371, x = (c-a)*Math.PI/180, y = (d-b)*Math.PI/180;
  const z = Math.sin(x/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z), Math.sqrt(1-z));
}
function isoDate(v: unknown) {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v), d = Number.isFinite(n) && n > 1e10 ? new Date(n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function fetchStateFacilities(state: string) {
  const all: any[] = []; let offset = 0;
  while (offset < 50000) {
    const p = new URLSearchParams({
      f: "json", where: `CWP_STATE = '${state}'`, outFields: FIELDS.join(","),
      returnGeometry: "false", resultOffset: String(offset), resultRecordCount: "1000", orderByFields: "OBJECTID ASC",
    });
    const r = await fetch(`${EPA_CWA_QUERY}?${p}`, { headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`EPA ECHO CWA query failed: ${r.status}`);
    const d = await r.json(); if (d?.error) throw new Error(d.error?.message || "EPA ECHO query error");
    const rows = d?.features || []; all.push(...rows.map((f: any) => f.attributes || {}));
    if (rows.length < 1000) break; offset += rows.length;
  }
  return all;
}

function choose(site: any, facilities: any[]) {
  const slat = Number(site.latitude), slon = Number(site.longitude); let best: any = null;
  for (const a of facilities) {
    const lat = Number(a.FAC_LAT), lon = Number(a.FAC_LONG);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat-slat) > .05 || Math.abs(lon-slon) > .07) continue;
    const d = distanceKm(slat, slon, lat, lon); if (d > 3) continue;
    const sim = Math.max(similarity(site.mine_name, a.CWP_NAME), similarity(site.operator_name, a.CWP_NAME));
    const exact = Boolean(site.npdes_permit_number) && String(site.npdes_permit_number).trim().toUpperCase() === String(a.SOURCE_ID || "").trim().toUpperCase();
    const score = (exact ? 100 : 0) + sim*10 + Math.max(0, 3-d);
    if (!best || score > best.score) best = { a, d, sim, exact, score };
  }
  if (!best) return null;
  if (!best.exact && !(best.d <= 1.5 && best.sim >= .34) && !(best.d <= .35 && best.sim >= .2)) return null;
  return best;
}

async function freshness(base44: any, source: string, payload: any) {
  const rows = await base44.asServiceRole.entities.DataFreshnessStatus.filter({ source }, "-updated_date", 1, 0);
  return rows?.[0] ? base44.asServiceRole.entities.DataFreshnessStatus.update(rows[0].id, payload) : base44.asServiceRole.entities.DataFreshnessStatus.create({ source, ...payload });
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const state = String(body?.state || "GA").trim().toUpperCase();
    if (!SUPPORTED.has(state)) return Response.json({ error: `Unsupported state: ${state}` }, { status: 400 });
    const limit = Math.min(Math.max(Number(body?.limit || 300), 1), 500);
    const now = new Date().toISOString();
    const allSites: any[] = [];
    for (let skip = 0; skip < 10000; skip += 500) {
      const batch = await base44.asServiceRole.entities.MiningSite.filter({ state }, "-updated_date", 500, skip);
      allSites.push(...(batch || [])); if (!batch || batch.length < 500) break;
    }
    const sites = allSites.filter((s: any) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude))).slice(0, limit);
    const facilities = await fetchStateFacilities(state);
    let matched = 0, noMatch = 0, envCreated = 0, envUpdated = 0, permitCreated = 0, permitUpdated = 0, inspectionsCreated = 0, sitesLinked = 0;
    const errors: any[] = [], sample: any[] = [];
    for (const site of sites) {
      try {
        const best: any = choose(site, facilities); if (!best) { noMatch++; continue; }
        const a = best.a, npdes = String(a.SOURCE_ID || "").trim(); if (!npdes) { noMatch++; continue; }
        matched++;
        const status = a.CWP_PERMIT_STATUS_DESC || a.CWP_STATUS || undefined;
        const viol = String(a.CWP_CURRENT_VIOL || "").trim(), snc = String(a.CWP_CURRENT_SNC_STATUS || "").trim();
        const enforcement = [
          Number(a.CWP_FORMAL_EA_CNT || 0) > 0 ? `${a.CWP_FORMAL_EA_CNT} formal enforcement action(s)` : null,
          Number(a.CWP_INFORMAL_ENF_ACT_COUNT || 0) > 0 ? `${a.CWP_INFORMAL_ENF_ACT_COUNT} informal enforcement action(s)` : null,
          a.CWP_SNC_EVENT_DESC || null,
        ].filter(Boolean).join("; ") || undefined;
        const matchNote = best.exact ? "exact permit ID" : `name ${best.sim.toFixed(2)}, ${best.d.toFixed(2)} km`;
        const env: any = {
          facility_name: a.CWP_NAME || site.mine_name, state, county: a.CWP_COUNTY || site.county || undefined,
          msha_mine_id: site.msha_mine_id || undefined, epa_registry_id: a.REGISTRY_ID || undefined,
          npdes_permit_number: npdes, program: "CWA / NPDES", record_type: "EPA ECHO facility compliance snapshot",
          status: snc || viol || status, agency: "US EPA ECHO / ICIS-NPDES", expiration_date: isoDate(a.CWP_EXPIRATION_DATE),
          violation_count: Number(a.CWP_QTRS_IN_NC || 0) || 0, enforcement_action: enforcement,
          latitude: Number(a.FAC_LAT) || Number(site.latitude), longitude: Number(a.FAC_LONG) || Number(site.longitude),
          source_url: EPA_CWA_LAYER, last_source_update: now,
          notes: `Automated ICIS-NPDES cross-check for ${STATE_NAME[state]} permit ${npdes}. Match: ${matchNote}. Current violation flag: ${viol || "not reported"}; SNC: ${snc || "not reported"}; inspections: ${a.CWP_INSPECTION_COUNT ?? "not reported"}. State mining-permit records remain the controlling mining authority source.`,
        };
        const er = await base44.asServiceRole.entities.EnvironmentalRecord.filter({ npdes_permit_number: npdes, program: "CWA / NPDES" }, "-updated_date", 1, 0);
        if (er?.[0]) { await base44.asServiceRole.entities.EnvironmentalRecord.update(er[0].id, env); envUpdated++; }
        else { await base44.asServiceRole.entities.EnvironmentalRecord.create(env); envCreated++; }

        const permit: any = {
          permit_number: npdes, permit_type: a.CWP_PERMIT_TYPE_DESC || "NPDES", facility_name: a.CWP_NAME || site.mine_name,
          operator_name: site.operator_name || undefined, status, county: a.CWP_COUNTY || site.county || undefined, state,
          latitude: Number(a.FAC_LAT) || Number(site.latitude), longitude: Number(a.FAC_LONG) || Number(site.longitude),
          msha_mine_id: site.msha_mine_id || undefined, npdes_permit_number: npdes, expiration_date: isoDate(a.CWP_EXPIRATION_DATE),
          source_url: EPA_CWA_LAYER, last_source_update: now,
          notes: `NPDES identity/status refreshed from EPA ECHO ICIS-NPDES for ${STATE_NAME[state]}. This is an environmental permit cross-check, not a substitute for the state's mining permit record.`,
        };
        const pr = await base44.asServiceRole.entities.TDECPermit.filter({ npdes_permit_number: npdes }, "-updated_date", 1, 0);
        if (pr?.[0]) { await base44.asServiceRole.entities.TDECPermit.update(pr[0].id, permit); permitUpdated++; }
        else { await base44.asServiceRole.entities.TDECPermit.create(permit); permitCreated++; }

        const idate = isoDate(a.CWP_DATE_LAST_INSPECTION);
        if (idate) {
          const ir = await base44.asServiceRole.entities.EnvironmentalInspection.filter({ npdes_permit_number: npdes, inspection_date: idate }, "-updated_date", 1, 0);
          if (!ir?.[0]) {
            await base44.asServiceRole.entities.EnvironmentalInspection.create({
              facility_name: a.CWP_NAME || site.mine_name, state, msha_mine_id: site.msha_mine_id || undefined,
              epa_registry_id: a.REGISTRY_ID || undefined, npdes_permit_number: npdes, agency: "US EPA ECHO / ICIS-NPDES",
              inspection_date: idate, inspection_type: "CWA/NPDES compliance inspection (latest date in ECHO snapshot)",
              result: viol || snc || "Result not stated in map snapshot", violations_found: Boolean(viol && !/^no$/i.test(viol)),
              source_url: EPA_CWA_LAYER, last_source_update: now,
              notes: `ECHO reports ${a.CWP_INSPECTION_COUNT ?? "an unspecified number of"} inspection(s); this stores the latest inspection date exposed by the facility layer.`,
            });
            inspectionsCreated++;
          }
        }
        if (!site.npdes_permit_number || String(site.npdes_permit_number).trim() !== npdes) {
          await base44.asServiceRole.entities.MiningSite.update(site.id, { npdes_permit_number: npdes }); sitesLinked++;
        }
        if (sample.length < 12) sample.push({ mine: site.mine_name, npdes, facility: a.CWP_NAME, status, distance_km: +best.d.toFixed(2), name_similarity: +best.sim.toFixed(2) });
      } catch (e: any) { errors.push({ site_id: site.id, mine: site.mine_name, error: e?.message || String(e) }); }
    }
    const success = errors.length < Math.max(5, Math.ceil(sites.length * .25));
    await freshness(base44, `Environmental-${state}`, { last_sync_at: now, latest_source_period: now.slice(0,10), status: success ? "Current" : "Error", records_updated: envCreated + envUpdated, error_message: success ? null : `${errors.length} site processing errors` });
    return Response.json({ success, state, source: EPA_CWA_LAYER, state_facilities: facilities.length, queried: sites.length, matched, no_match: noMatch, environmental_created: envCreated, environmental_updated: envUpdated, permits_created: permitCreated, permits_updated: permitUpdated, inspections_created: inspectionsCreated, sites_linked: sitesLinked, errors: errors.slice(0,25), sample });
  } catch (e: any) {
    const msg = e?.message || String(e);
    try { await base44.asServiceRole.entities.OperationalError.create({ area: "Data", operation: "sync-southeast-npdes-environmental", error_message: msg, severity: "Critical", status: "Open", occurred_at: new Date().toISOString() }); } catch (_) {}
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
