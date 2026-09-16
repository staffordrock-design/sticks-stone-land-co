import { createClientFromRequest } from "npm:@base44/sdk";
import { unzipSync, strFromU8 } from "npm:fflate";

const NC_KMZ = "https://www.deq.nc.gov/energy-mineral-and-land-resources/land-quality/mining/miningkmzfile/open";
const NC_SOURCE = "https://www.deq.nc.gov/about/divisions/energy-mineral-and-land-resources/mining-program";

function decode(v: string) { return String(v || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function norm(v: unknown) { return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function key(v: unknown) { return norm(v).replace(/\s+/g, ""); }
function num(v: unknown) { const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); const n = m ? Number(m[0]) : NaN; return Number.isFinite(n) ? n : undefined; }
function words(v: unknown) { const stop = new Set(["llc","inc","company","co","corp","corporation","quarry","mine","mines","plant","the","and","north","carolina"]); return new Set(norm(v).split(/\s+/).filter((t) => t.length > 2 && !stop.has(t))); }
function similarity(a: unknown, b: unknown) { const aa = words(a), bb = words(b); if (!aa.size || !bb.size) return 0; let hit = 0; for (const t of aa) if (bb.has(t)) hit++; return hit / Math.max(aa.size, bb.size); }
function distanceKm(a: number,b: number,c: number,d: number){const R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,z=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));}
function county(v: unknown) { return norm(v).replace(/\bcounty\b/g, "").trim(); }

function tag(block: string, name: string) { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")); return m ? decode(m[1]) : undefined; }
function extended(block: string) {
  const out: Record<string,string> = {};
  for (const m of block.matchAll(/<Data\s+name=["']([^"']+)["'][^>]*>[\s\S]*?<value>([\s\S]*?)<\/value>[\s\S]*?<\/Data>/gi)) out[key(m[1])] = decode(m[2]);
  for (const m of block.matchAll(/<SimpleData\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/SimpleData>/gi)) out[key(m[1])] = decode(m[2]);
  const desc = tag(block, "description") || "";
  const rawCells = [...desc.matchAll(/(?:^|[;|])\s*([^:;|]{2,50})\s*:\s*([^;|]{1,160})/g)];
  for (const m of rawCells) if (!out[key(m[1])]) out[key(m[1])] = String(m[2]).trim();
  return out;
}
function pick(attrs: Record<string,string>, aliases: string[]) { for (const a of aliases) { const v = attrs[key(a)]; if (v) return v; } return undefined; }
function placemarks(kml: string) {
  const rows: any[] = [];
  for (const m of kml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/gi)) {
    const block = m[0], attrs = extended(block), name = tag(block, "name");
    const cm = block.match(/<coordinates>\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:,[^<\s]+)?\s*<\/coordinates>/i);
    const lon = cm ? Number(cm[1]) : undefined, lat = cm ? Number(cm[2]) : undefined;
    const permitNumber = pick(attrs, ["permit number","permit no","permit","permitnumber","permit_no"]);
    const mineName = pick(attrs, ["mine name","mine","facility name","site name","minename"]) || name;
    const permittee = pick(attrs, ["permittee","permittee name","operator","owner","company"]);
    const status = pick(attrs, ["status","permit status","permitstatus"]);
    const commodity = pick(attrs, ["commodity","material","mineral","commodity type"]);
    const acres = num(pick(attrs, ["permitted acres","permit acres","acres","acreage","permittedacres"]));
    const countyName = pick(attrs, ["county","county name","countyname"]);
    if (!permitNumber && !mineName) continue;
    rows.push({ permitNumber, mineName, permittee, status, commodity, acres, county: countyName, latitude: lat, longitude: lon, attrs });
  }
  return rows;
}
function choosePermit(p: any, sites: any[]) {
  let best: any = null;
  for (const site of sites) {
    const sameCounty = p.county && site.county ? county(p.county) === county(site.county) : false;
    if (p.county && site.county && !sameCounty) continue;
    const nameSim = similarity(p.mineName, site.mine_name), opSim = similarity(p.permittee, site.operator_name);
    let dist = Infinity;
    if (Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude))) dist = distanceKm(Number(p.latitude), Number(p.longitude), Number(site.latitude), Number(site.longitude));
    let score = sameCounty ? 2 : 0;
    if (dist <= .5) score += 9; else if (dist <= 2) score += 7; else if (dist <= 5) score += 4; else if (dist <= 10) score += 1;
    score += nameSim >= .75 ? 8 : nameSim >= .5 ? 6 : nameSim >= .3 ? 3 : 0;
    score += opSim >= .75 ? 4 : opSim >= .5 ? 2 : 0;
    const strong = dist <= 2 || nameSim >= .5 || (sameCounty && nameSim >= .3 && opSim >= .3);
    if (score >= 7 && strong && (!best || score > best.score || (score === best.score && dist < best.dist))) best = { site, score, dist, nameSim, opSim };
  }
  return best;
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const resp = await fetch(NC_KMZ, { headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" }, signal: AbortSignal.timeout(45000) });
    if (!resp.ok) throw new Error(`NC DEQ mining KMZ failed: ${resp.status}`);
    const zip = unzipSync(new Uint8Array(await resp.arrayBuffer()));
    const kmlName = Object.keys(zip).find((n) => /\.kml$/i.test(n)); if (!kmlName) throw new Error("NC DEQ KMZ contained no KML file");
    const permits = placemarks(strFromU8(zip[kmlName]));
    const sites: any[] = [];
    for (let skip = 0; skip < 10000; skip += 500) { const page = await base44.asServiceRole.entities.MiningSite.filter({ state: "NC" }, "-updated_date", 500, skip); sites.push(...(page || [])); if (!page || page.length < 500) break; }
    const now = new Date().toISOString();
    let matched = 0, created = 0, updated = 0, siteUpdates = 0, unmatched = 0;
    const sample: any[] = [], errors: any[] = [];
    for (const p of permits) {
      try {
        const match = choosePermit(p, sites); if (!match) { unmatched++; continue; }
        matched++;
        const site = match.site;
        const permitNumber = p.permitNumber || `NC-DEQ-${key(p.mineName).slice(0,40)}`;
        const record: any = {
          permit_number: permitNumber, permit_type: "NC DEQ Mining Permit", facility_name: p.mineName || site.mine_name,
          permittee_name: p.permittee || undefined, operator_name: site.operator_name || p.permittee || undefined,
          status: p.status || undefined, county: p.county || site.county || undefined, state: "NC",
          latitude: Number.isFinite(Number(p.latitude)) ? Number(p.latitude) : Number(site.latitude),
          longitude: Number.isFinite(Number(p.longitude)) ? Number(p.longitude) : Number(site.longitude),
          msha_mine_id: site.msha_mine_id || undefined, surface_mining_permit_number: p.permitNumber || undefined,
          permitted_acres: p.acres, acreage_basis: p.acres ? "NC DEQ mining permit dataset permitted acreage" : undefined,
          acreage_source_url: p.acres ? NC_SOURCE : undefined, acreage_last_verified: p.acres ? now : undefined,
          source_url: NC_SOURCE, last_source_update: now,
          notes: `Official NC DEQ Mining Program KMZ match to MSHA mine ${site.msha_mine_id || "—"}. Match score ${match.score}; name similarity ${match.nameSim.toFixed(2)}${Number.isFinite(match.dist) ? `; distance ${match.dist.toFixed(2)} km` : ""}. Commodity: ${p.commodity || "not stated"}.`,
        };
        const existing = await base44.asServiceRole.entities.TDECPermit.filter({ state: "NC", surface_mining_permit_number: p.permitNumber || permitNumber }, "-updated_date", 1, 0);
        if (existing?.[0]) { await base44.asServiceRole.entities.TDECPermit.update(existing[0].id, record); updated++; }
        else { await base44.asServiceRole.entities.TDECPermit.create(record); created++; }
        const patch: any = {};
        if (p.permittee && !site.permittee_name) patch.permittee_name = p.permittee;
        if (p.acres && (!site.permitted_acres || Number(site.permitted_acres) !== Number(p.acres))) { patch.permitted_acres = p.acres; patch.permitted_acres_basis = "NC DEQ mining permit dataset permitted acreage"; patch.permitted_acres_source_url = NC_SOURCE; patch.permitted_acres_last_verified = now; }
        if (Object.keys(patch).length) { await base44.asServiceRole.entities.MiningSite.update(site.id, patch); siteUpdates++; }
        if (sample.length < 12) sample.push({ mine: site.mine_name, permit: permitNumber, permittee: p.permittee, status: p.status, permitted_acres: p.acres, score: match.score });
      } catch (e: any) { errors.push({ permit: p.permitNumber, mine: p.mineName, error: e?.message || String(e) }); }
    }
    return Response.json({ success: true, source: NC_KMZ, official_permit_placemarks: permits.length, matched, unmatched, created, updated, site_updates: siteUpdates, errors: errors.slice(0,25), sample, note: "NC DEQ Mining Program is the controlling state source. Permitted acreage is stored only when the official KMZ states it; parcel acreage remains separate." });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
