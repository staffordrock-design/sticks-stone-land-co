import { createClientFromRequest } from "npm:@base44/sdk";

const SC_LAYER = "https://gis.des.sc.gov/gisserver/rest/services/lwm/ActiveMinesViewer/MapServer/0";
const SC_QUERY = `${SC_LAYER}/query`;
const SC_PROGRAM = "https://des.sc.gov/programs/bureau-land-waste-management/mining-and-reclamation";

function norm(v: unknown) {
  return String(v || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function countyKey(v: unknown) { return norm(v).replace(/\bcounty\b/g, "").trim(); }
function words(v: unknown) {
  const stop = new Set(["llc","inc","company","co","corp","corporation","quarry","mine","mines","plant","the","and","south","carolina","materials","construction"]);
  return new Set(norm(v).split(/\s+/).filter((t) => t.length > 2 && !stop.has(t)));
}
function similarity(a: unknown, b: unknown) {
  const aa = words(a), bb = words(b);
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  for (const t of aa) if (bb.has(t)) hit++;
  return hit / Math.max(aa.size, bb.size);
}
function distanceKm(a:number,b:number,c:number,d:number){
  const R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180;
  const z=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function validCoord(lat: unknown, lon: unknown) {
  const a = Number(lat), o = Number(lon);
  return Number.isFinite(a) && Number.isFinite(o) && a >= 32 && a <= 36 && o >= -84 && o <= -78;
}

async function fetchAllPermits() {
  const rows: any[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const p = new URLSearchParams({
      f: "json",
      where: "1=1",
      outFields: "OBJECTID,PrmtPrmtNum,PrmtRefPrmtStatDescr,PrmtPrmt,SiteName,SiteLatitude,SiteLongitude,SiteCnty,MinesDtlsMinedMatrl",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: "1000",
      orderByFields: "OBJECTID ASC",
    });
    const r = await fetch(`${SC_QUERY}?${p.toString()}`, {
      headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`SC DES ActiveMinesViewer query failed: ${r.status}`);
    const d = await r.json();
    if (d?.error) throw new Error(d.error?.message || "SC DES ActiveMinesViewer ArcGIS error");
    const page = (d?.features || []).map((f: any) => f.attributes || {});
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function loadScSites(base44: any) {
  const rows: any[] = [];
  for (let skip = 0; skip < 10000; skip += 500) {
    const page = await base44.asServiceRole.entities.MiningSite.filter({ state: "SC" }, "-updated_date", 500, skip);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

function choosePermit(p: any, sites: any[]) {
  const plat = Number(p.SiteLatitude), plon = Number(p.SiteLongitude);
  const pc = countyKey(p.SiteCnty);
  let best: any = null;

  for (const site of sites) {
    const sc = countyKey(site.county);
    const sameCounty = Boolean(pc && sc && pc === sc);
    if (pc && sc && !sameCounty) continue;

    const nameSim = similarity(p.SiteName, site.mine_name);
    const ownerSim = Math.max(similarity(p.PrmtPrmt, site.operator_name), similarity(p.PrmtPrmt, site.controller_name));
    let dist = Infinity;
    if (validCoord(plat, plon) && validCoord(site.latitude, site.longitude)) {
      dist = distanceKm(plat, plon, Number(site.latitude), Number(site.longitude));
    }

    let score = sameCounty ? 2 : 0;
    if (dist <= 0.5) score += 10;
    else if (dist <= 2) score += 8;
    else if (dist <= 5) score += 5;
    else if (dist <= 10) score += 2;
    if (nameSim >= .75) score += 8;
    else if (nameSim >= .5) score += 6;
    else if (nameSim >= .3) score += 3;
    if (ownerSim >= .75) score += 4;
    else if (ownerSim >= .5) score += 2;

    const strong = dist <= 2 || nameSim >= .5 || (sameCounty && nameSim >= .3 && ownerSim >= .3);
    if (score >= 7 && strong && (!best || score > best.score || (score === best.score && dist < best.dist))) {
      best = { site, score, dist, nameSim, ownerSim };
    }
  }
  return best;
}

async function saveFreshness(base44: any, payload: any) {
  const source = "SC DES Mining";
  const rows = await base44.asServiceRole.entities.DataFreshnessStatus.filter({ source }, "-updated_date", 1, 0).catch(() => []);
  if (rows?.[0]?.id) return base44.asServiceRole.entities.DataFreshnessStatus.update(rows[0].id, payload);
  return base44.asServiceRole.entities.DataFreshnessStatus.create({ source, ...payload });
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const [permits, sites] = await Promise.all([fetchAllPermits(), loadScSites(base44)]);
    const now = new Date().toISOString();
    let matched = 0, unmatched = 0, created = 0, updated = 0, siteUpdates = 0;
    const sample: any[] = [], errors: any[] = [];

    for (const p of permits) {
      try {
        const permitNumber = String(p.PrmtPrmtNum || "").trim();
        const siteName = String(p.SiteName || "").trim();
        if (!permitNumber || !siteName) { unmatched++; continue; }

        const match = choosePermit(p, sites);
        if (!match) { unmatched++; continue; }
        matched++;
        const site = match.site;
        const lat = validCoord(p.SiteLatitude, p.SiteLongitude) ? Number(p.SiteLatitude) : Number(site.latitude);
        const lon = validCoord(p.SiteLatitude, p.SiteLongitude) ? Number(p.SiteLongitude) : Number(site.longitude);
        const material = String(p.MinesDtlsMinedMatrl || "").trim() || undefined;
        const permitOwner = String(p.PrmtPrmt || "").trim() || undefined;
        const status = String(p.PrmtRefPrmtStatDescr || "").trim() || undefined;

        const record: any = {
          permit_number: permitNumber,
          permit_type: "SC DES Mine Operating Permit",
          facility_name: siteName,
          permittee_name: permitOwner,
          operator_name: site.operator_name || permitOwner,
          status,
          county: String(p.SiteCnty || site.county || "").trim() || undefined,
          state: "SC",
          latitude: Number.isFinite(lat) ? lat : undefined,
          longitude: Number.isFinite(lon) ? lon : undefined,
          msha_mine_id: site.msha_mine_id || undefined,
          surface_mining_permit_number: permitNumber,
          source_url: SC_LAYER,
          last_source_update: now,
          notes: `Official South Carolina DES Mining & Reclamation ActiveMinesViewer record linked to MSHA mine ${site.msha_mine_id || "—"}. Permit owner: ${permitOwner || "not stated"}; mined material: ${material || "not stated"}. Match score ${match.score}; name similarity ${match.nameSim.toFixed(2)}; owner/operator similarity ${match.ownerSim.toFixed(2)}${Number.isFinite(match.dist) ? `; distance ${match.dist.toFixed(2)} km` : ""}. This is the state mining-permit record; parcel ownership and NPDES/air permits remain separate source records.`,
        };

        const existing = await base44.asServiceRole.entities.TDECPermit.filter(
          { state: "SC", surface_mining_permit_number: permitNumber }, "-updated_date", 1, 0
        );
        if (existing?.[0]) { await base44.asServiceRole.entities.TDECPermit.update(existing[0].id, record); updated++; }
        else { await base44.asServiceRole.entities.TDECPermit.create(record); created++; }

        const patch: any = {};
        if (permitOwner && !site.permittee_name) patch.permittee_name = permitOwner;
        if (Object.keys(patch).length) { await base44.asServiceRole.entities.MiningSite.update(site.id, patch); siteUpdates++; }

        if (sample.length < 15) sample.push({
          mine: site.mine_name, msha: site.msha_mine_id || null, permit: permitNumber,
          permit_owner: permitOwner || null, status: status || null, material: material || null,
          county: p.SiteCnty || site.county || null, score: match.score,
          distance_km: Number.isFinite(match.dist) ? Number(match.dist.toFixed(2)) : null,
        });
      } catch (e: any) {
        errors.push({ permit: p.PrmtPrmtNum, mine: p.SiteName, error: e?.message || String(e) });
      }
    }

    const success = errors.length < Math.max(5, Math.ceil(Math.max(matched, 1) * .2));
    await saveFreshness(base44, {
      last_sync_at: now,
      latest_source_period: now.slice(0,10),
      status: success ? "Current" : "Error",
      records_updated: created + updated,
      error_message: success ? null : `${errors.length} SC mining permit processing errors`,
    }).catch(() => null);

    return Response.json({
      success,
      source: SC_LAYER,
      program: SC_PROGRAM,
      official_active_mine_records: permits.length,
      sc_msha_sites: sites.length,
      matched, unmatched, created, updated, site_updates: siteUpdates,
      errors: errors.slice(0,25), sample,
      note: "SC DES Mining & Reclamation ActiveMinesViewer is the controlling state mining-permit source used here. Records are matched to MSHA mines by county, coordinates, site name and permit-owner/operator similarity. Air permits, NPDES records and parcel ownership remain separately sourced.",
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    try { await base44.asServiceRole.entities.OperationalError.create({ area: "Data", operation: "sync-sc-mining-permits", error_message: msg, severity: "Critical", status: "Open", occurred_at: new Date().toISOString() }); } catch (_) {}
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
