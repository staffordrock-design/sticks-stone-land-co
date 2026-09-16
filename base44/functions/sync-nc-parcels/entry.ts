import { createClientFromRequest } from "npm:@base44/sdk";

const PARCEL_LAYER = "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1";
const PARCEL_QUERY = `${PARCEL_LAYER}/query`;
const FIELDS = ["parno","altparno","ownname","improvval","landval","parval","mailadd","siteadd","gisacres","recareano","recareatx","sourceref","sourcedate","nparno","cntyname","sourceagnt"].join(",");

function text(v: unknown) { const s = String(v ?? "").trim(); return s || undefined; }
function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function isoDate(v: unknown) { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return undefined; const d = new Date(n); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); }
function validCoord(lat: unknown, lon: unknown) { const a = Number(lat), o = Number(lon); return Number.isFinite(a) && Number.isFinite(o) && a >= 33.7 && a <= 36.8 && o >= -84.5 && o <= -75.2; }

async function parcelAt(lat: number, lon: number) {
  const params = new URLSearchParams({
    f: "json", geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: FIELDS, returnGeometry: "false", resultRecordCount: "10",
  });
  const resp = await fetch(`${PARCEL_QUERY}?${params}`, { headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" }, signal: AbortSignal.timeout(25000) });
  if (!resp.ok) throw new Error(`NC OneMap parcel query failed: ${resp.status}`);
  const data = await resp.json(); if (data?.error) throw new Error(data.error?.message || "NC OneMap parcel query error");
  return (data?.features || []).map((f: any) => f.attributes || {});
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit || 120), 1), 300);
    const now = new Date().toISOString();
    const allSites: any[] = [];
    for (let skip = 0; skip < 10000; skip += 500) {
      const page = await base44.asServiceRole.entities.MiningSite.filter({ state: "NC" }, "-updated_date", 500, skip);
      allSites.push(...(page || [])); if (!page || page.length < 500) break;
    }
    const candidates = allSites.filter((s: any) => validCoord(s.latitude, s.longitude));
    const missingFirst = [...candidates].sort((a: any, b: any) => Number(Boolean(a.parcel_id)) - Number(Boolean(b.parcel_id))).slice(0, limit);
    let queried = 0, matched = 0, created = 0, updated = 0, sitesLinked = 0, noMatch = 0;
    const sample: any[] = [], errors: any[] = [];
    for (const site of missingFirst) {
      queried++;
      try {
        const rows = await parcelAt(Number(site.latitude), Number(site.longitude));
        const a = rows[0]; if (!a) { noMatch++; continue; }
        const parcelId = text(a.parno) || text(a.nparno) || text(a.altparno); if (!parcelId) { noMatch++; continue; }
        matched++;
        const acreage = num(a.gisacres) ?? num(a.recareano);
        const record: any = {
          state: "NC", county: text(a.cntyname) || site.county || "Unknown", parcel_id: parcelId,
          owner_name: text(a.ownname), property_address: text(a.siteadd), mailing_address: text(a.mailadd), acreage,
          assessed_value: num(a.parval), land_value: num(a.landval), improvement_value: num(a.improvval),
          latitude: Number(site.latitude), longitude: Number(site.longitude), msha_mine_id: site.msha_mine_id || undefined,
          deed_book_page: text(a.sourceref), source_name: `NC OneMap statewide parcel layer${text(a.sourceagnt) ? ` · ${text(a.sourceagnt)}` : ""}`,
          source_url: PARCEL_LAYER, last_source_update: isoDate(a.sourcedate) || now,
        };
        const existing = await base44.asServiceRole.entities.ParcelRecord.filter({ state: "NC", county: record.county, parcel_id: parcelId }, "-updated_date", 1, 0);
        if (existing?.[0]) { await base44.asServiceRole.entities.ParcelRecord.update(existing[0].id, record); updated++; }
        else { await base44.asServiceRole.entities.ParcelRecord.create(record); created++; }
        const patch: any = {};
        if (!site.parcel_id || site.parcel_id !== parcelId) patch.parcel_id = parcelId;
        if (record.owner_name && (!site.parcel_owner || site.parcel_owner !== record.owner_name)) patch.parcel_owner = record.owner_name;
        if (acreage && (!site.acreage || Number(site.acreage) !== acreage)) patch.acreage = acreage;
        if (Object.keys(patch).length) { await base44.asServiceRole.entities.MiningSite.update(site.id, patch); sitesLinked++; }
        if (sample.length < 12) sample.push({ mine: site.mine_name, county: record.county, parcel_id: parcelId, owner: record.owner_name, acreage });
      } catch (e: any) { errors.push({ site_id: site.id, mine: site.mine_name, error: e?.message || String(e) }); }
    }
    return Response.json({ success: true, source: PARCEL_LAYER, queried, matched, no_match: noMatch, created, updated, sites_linked: sitesLinked, errors: errors.slice(0,25), sample, note: "NC OneMap parcel polygons are matched by the MSHA mine coordinate. The containing tax parcel is a screening record and does not prove the full quarry footprint or title." });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
