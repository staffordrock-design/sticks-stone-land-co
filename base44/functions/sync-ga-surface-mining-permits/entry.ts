import { createClientFromRequest } from "npm:@base44/sdk";
import * as XLSX from "npm:xlsx";

const GA_PAGE = "https://epd.georgia.gov/about-us/land-protection-branch/surface-mining";
const FALLBACK_XLSX = "https://epd.georgia.gov/document/document/permitted-surface-mines-april-2026xlsx/download";

function clean(v: unknown) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
function key(v: unknown) { return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function num(v: unknown) { const m = clean(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); const n = m ? Number(m[0]) : NaN; return Number.isFinite(n) ? n : undefined; }
function county(v: unknown) { return clean(v).toLowerCase().replace(/\bcounty\b/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function words(v: unknown) { const stop = new Set(["llc","inc","company","co","corp","corporation","quarry","mine","mines","plant","pit","the","and","georgia"]); return new Set(clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter((t) => t.length > 2 && !stop.has(t))); }
function similarity(a: unknown,b: unknown){const aa=words(a),bb=words(b);if(!aa.size||!bb.size)return 0;let hit=0;for(const t of aa)if(bb.has(t))hit++;return hit/Math.max(aa.size,bb.size)}
function distanceKm(a:number,b:number,c:number,d:number){const R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,z=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z))}

async function discoverWorkbook() {
  try {
    const page = await fetch(GA_PAGE, { headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" }, signal: AbortSignal.timeout(25000) });
    if (page.ok) {
      const html = await page.text();
      const links = [...html.matchAll(/href=["']([^"']+\.xlsx(?:\/download)?[^"']*)["']/gi)].map((m) => m[1]);
      const preferred = links.find((u) => /surface.*mine|mine.*surface|permitted/i.test(u)) || links[0];
      if (preferred) return new URL(preferred.replace(/&amp;/g, "&"), GA_PAGE).toString();
    }
  } catch {}
  return FALLBACK_XLSX;
}
function makeHeaders(row: any[]) {
  const used = new Map<string,number>();
  return row.map((v, i) => { let h = key(v) || `col${i}`; const n = used.get(h) || 0; used.set(h, n+1); if (n) h = `${h}${n+1}`; return h; });
}
function rowObjects(rows: any[][]) {
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const keys = rows[i].map(key);
    if (keys.some((k) => k.includes("permit")) && keys.some((k) => k.includes("county") || k.includes("mine") || k.includes("facility") || k.includes("operator"))) { hi = i; break; }
  }
  if (hi < 0) hi = 0;
  const headers = makeHeaders(rows[hi]);
  return rows.slice(hi + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))).filter((r) => Object.values(r).some((v) => clean(v)));
}
function pick(r: any, aliases: string[]) {
  const entries = Object.entries(r);
  for (const alias of aliases) {
    const a = key(alias);
    const exact = entries.find(([k,v]) => k === a && clean(v)); if (exact) return clean(exact[1]);
  }
  for (const alias of aliases) {
    const a = key(alias);
    const fuzzy = entries.find(([k,v]) => (k.includes(a) || a.includes(k)) && clean(v)); if (fuzzy) return clean(fuzzy[1]);
  }
  return undefined;
}
function parsePermit(r: any) {
  const permitNumber = pick(r,["permit number","permit no","permit","permit id"]);
  const mineName = pick(r,["mine name","facility name","site name","mine","facility","site"]);
  const permittee = pick(r,["permittee","permittee name","operator","operator name","company","owner"]);
  const countyName = pick(r,["county","county name"]);
  const status = pick(r,["status","permit status","mine status"]);
  const commodity = pick(r,["commodity","mineral","material","product"]);
  const lat = num(pick(r,["latitude","lat"])), lon = num(pick(r,["longitude","long","lon"]));
  const acres = num(pick(r,["permitted acres","permit acres","acreage","acres","affected acres"]));
  return { permitNumber, mineName, permittee, county: countyName, status, commodity, latitude: lat, longitude: lon, acres };
}
function choose(p:any, sites:any[]) {
  let best:any=null;
  for(const site of sites){
    const sameCounty=p.county&&site.county?county(p.county)===county(site.county):false;
    if(p.county&&site.county&&!sameCounty)continue;
    const nameSim=Math.max(similarity(p.mineName,site.mine_name),similarity(p.mineName,site.operator_name));
    const opSim=Math.max(similarity(p.permittee,site.operator_name),similarity(p.permittee,site.mine_name));
    let dist=Infinity;if(Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Number.isFinite(Number(site.latitude))&&Number.isFinite(Number(site.longitude)))dist=distanceKm(p.latitude,p.longitude,Number(site.latitude),Number(site.longitude));
    let score=sameCounty?2:0;if(dist<=.5)score+=9;else if(dist<=2)score+=7;else if(dist<=5)score+=4;else if(dist<=10)score+=1;
    score+=nameSim>=.75?8:nameSim>=.5?6:nameSim>=.3?3:0;score+=opSim>=.75?4:opSim>=.5?2:0;
    if(score>=7&&(dist<=2||nameSim>=.5||(sameCounty&&nameSim>=.3&&opSim>=.3))&&(!best||score>best.score||score===best.score&&dist<best.dist))best={site,score,dist,nameSim,opSim};
  }
  return best;
}

export default async function(req:Request){const base44=createClientFromRequest(req);try{
  const user=await base44.auth.me().catch(()=>null);if(user&&user.role!=="admin")return Response.json({error:"Admin access required"},{status:403});
  const workbookUrl=await discoverWorkbook();
  const resp=await fetch(workbookUrl,{headers:{"User-Agent":"SSRockHoldings/1.0 quarry-intelligence"},signal:AbortSignal.timeout(45000)});if(!resp.ok)throw new Error(`Georgia EPD surface-mine workbook failed: ${resp.status}`);
  const wb=XLSX.read(new Uint8Array(await resp.arrayBuffer()),{type:"array"});const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw new Error("Georgia EPD workbook contained no worksheet");
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:""}) as any[][];const sourceRows=rowObjects(rows);const permits=sourceRows.map(parsePermit).filter((p)=>p.permitNumber||p.mineName);
  const sites:any[]=[];for(let skip=0;skip<10000;skip+=500){const page=await base44.asServiceRole.entities.MiningSite.filter({state:"GA"},"-updated_date",500,skip);sites.push(...(page||[]));if(!page||page.length<500)break}
  const now=new Date().toISOString();let matched=0,created=0,updated=0,siteUpdates=0,unmatched=0;const sample:any[]=[],errors:any[]=[];
  for(const p of permits){try{const match=choose(p,sites);if(!match){unmatched++;continue}matched++;const site=match.site;const permitNumber=p.permitNumber||`GA-EPD-${key(p.mineName).slice(0,40)}`;const record:any={permit_number:permitNumber,permit_type:"Georgia EPD Surface Mining Permit",facility_name:p.mineName||site.mine_name,permittee_name:p.permittee||undefined,operator_name:site.operator_name||p.permittee||undefined,status:p.status||undefined,county:p.county||site.county||undefined,state:"GA",latitude:Number.isFinite(p.latitude)?p.latitude:Number(site.latitude),longitude:Number.isFinite(p.longitude)?p.longitude:Number(site.longitude),msha_mine_id:site.msha_mine_id||undefined,surface_mining_permit_number:p.permitNumber||undefined,permitted_acres:p.acres,acreage_basis:p.acres?"Georgia EPD permitted surface-mine acreage":undefined,acreage_source_url:p.acres?workbookUrl:undefined,acreage_last_verified:p.acres?now:undefined,source_url:workbookUrl,last_source_update:now,notes:`Official Georgia EPD permitted-surface-mines workbook match to MSHA mine ${site.msha_mine_id||"—"}. Match score ${match.score}; name similarity ${match.nameSim.toFixed(2)}${Number.isFinite(match.dist)?`; distance ${match.dist.toFixed(2)} km`:""}. Commodity: ${p.commodity||"not stated"}.`};
    const existing=await base44.asServiceRole.entities.TDECPermit.filter({state:"GA",surface_mining_permit_number:p.permitNumber||permitNumber},"-updated_date",1,0);if(existing?.[0]){await base44.asServiceRole.entities.TDECPermit.update(existing[0].id,record);updated++}else{await base44.asServiceRole.entities.TDECPermit.create(record);created++}
    const patch:any={};if(p.permittee&&!site.permittee_name)patch.permittee_name=p.permittee;if(p.acres&&(!site.permitted_acres||Number(site.permitted_acres)!==Number(p.acres))){patch.permitted_acres=p.acres;patch.permitted_acres_basis="Georgia EPD permitted surface-mine acreage";patch.permitted_acres_source_url=workbookUrl;patch.permitted_acres_last_verified=now}if(Object.keys(patch).length){await base44.asServiceRole.entities.MiningSite.update(site.id,patch);siteUpdates++}if(sample.length<12)sample.push({mine:site.mine_name,permit:permitNumber,permittee:p.permittee,status:p.status,permitted_acres:p.acres,score:match.score});
  }catch(e:any){errors.push({permit:p.permitNumber,mine:p.mineName,error:e?.message||String(e)})}}
  return Response.json({success:true,source:workbookUrl,official_rows:permits.length,matched,unmatched,created,updated,site_updates:siteUpdates,errors:errors.slice(0,25),sample,note:"Georgia EPD is the controlling surface-mining permit source. Parcel ownership remains a separate county-record source."});
}catch(e:any){return Response.json({success:false,error:e?.message||String(e)},{status:500})}}
