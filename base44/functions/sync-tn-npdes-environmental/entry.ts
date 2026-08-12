import { createClientFromRequest } from "npm:@base44/sdk";

const EPA_CWA_LAYER = "https://echogeo.epa.gov/arcgis/rest/services/ECHO/Facilities/MapServer/2";
const EPA_CWA_QUERY = `${EPA_CWA_LAYER}/query`;
const MAX_DISTANCE_KM = 3;

function norm(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: unknown) {
  const stop = new Set(["llc","inc","company","co","corp","corporation","quarry","mine","mines","plant","the","and"]);
  return new Set(norm(value).split(/\s+/).filter((t) => t.length > 2 && !stop.has(t)));
}

function similarity(a: unknown, b: unknown) {
  const aa = tokens(a); const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  let hit = 0; for (const t of aa) if (bb.has(t)) hit++;
  return hit / Math.max(aa.size, bb.size);
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isoDate(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  const d = Number.isFinite(n) && n > 10000000000 ? new Date(n) : new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function queryNearby(site: any) {
  const lat = Number(site.latitude), lon = Number(site.longitude);
  const params = new URLSearchParams({
    f: "json",
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(MAX_DISTANCE_KM),
    units: "esriSRUnit_Kilometer",
    outSR: "4326",
    returnGeometry: "false",
    outFields: [
      "SOURCE_ID","REGISTRY_ID","CWP_NAME","CWP_STATE","CWP_COUNTY","CWP_STATUS",
      "CWP_PERMIT_STATUS_DESC","CWP_PERMIT_TYPE_DESC","CWP_EXPIRATION_DATE",
      "CWP_CURRENT_SNC_STATUS","CWP_SNC_EVENT_DESC","CWP_QTRS_IN_NC","CWP_CURRENT_VIOL",
      "CWP_INSPECTION_COUNT","CWP_DATE_LAST_INSPECTION","CWP_FORMAL_EA_CNT","CWP_DATE_LAST_FEA",
      "CWP_INFORMAL_ENF_ACT_COUNT","CWP_DATE_LAST_INFORMAL_EA","FAC_LAT","FAC_LONG"
    ].join(","),
    resultRecordCount: "50",
  });
  const url = `${EPA_CWA_QUERY}?${params.toString()}`;
  const r = await fetch(url, { headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`EPA ECHO CWA query failed: ${r.status}`);
  const data = await r.json();
  if (data?.error) throw new Error(data.error?.message || "EPA ECHO ArcGIS query error");
  return { features: data?.features || [], url };
}

function choose(site: any, features: any[]) {
  const slat = Number(site.latitude), slon = Number(site.longitude);
  const scored = features.map((f: any) => {
    const a = f.attributes || {};
    const d = Number.isFinite(Number(a.FAC_LAT)) && Number.isFinite(Number(a.FAC_LONG)) ? distanceKm(slat, slon, Number(a.FAC_LAT), Number(a.FAC_LONG)) : 999;
    const sim = Math.max(similarity(site.mine_name, a.CWP_NAME), similarity(site.operator_name, a.CWP_NAME));
    const permitExact = site.npdes_permit_number && String(site.npdes_permit_number).trim().toUpperCase() === String(a.SOURCE_ID || "").trim().toUpperCase();
    const score = (permitExact ? 100 : 0) + sim * 10 + Math.max(0, 3-d);
    return { f, a, d, sim, permitExact, score };
  }).sort((x:any,y:any)=>y.score-x.score);
  const best = scored[0];
  if (!best) return null;
  // Exact permit always wins; otherwise require a strong geographic + name relationship.
  if (!best.permitExact && !(best.d <= 1.5 && best.sim >= 0.34) && !(best.d <= 0.35 && best.sim >= 0.2)) return null;
  return best;
}

async function upsertFreshness(base44:any, source:string, payload:any) {
  const rows = await base44.asServiceRole.entities.DataFreshnessStatus.filter({ source }, "-updated_date", 1, 0);
  if (rows?.[0]) return base44.asServiceRole.entities.DataFreshnessStatus.update(rows[0].id, payload);
  return base44.asServiceRole.entities.DataFreshnessStatus.create({ source, ...payload });
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(()=>null);
    // Scheduled service-role invocation is allowed; direct user invocation requires admin.
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(()=>({}));
    const limit = Math.min(Math.max(Number(body?.limit || 500), 1), 500);
    const sites = (await base44.asServiceRole.entities.MiningSite.list("-updated_date", 500) || [])
      .filter((s:any)=>String(s.state||"").toUpperCase()==="TN" && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
      .slice(0, limit);

    let queried=0, matched=0, envCreated=0, envUpdated=0, permitCreated=0, permitUpdated=0, inspectionsCreated=0, sitesLinked=0, noMatch=0;
    const errors:any[]=[]; const sample:any[]=[]; const now=new Date().toISOString();

    for (const site of sites) {
      queried++;
      try {
        const { features, url } = await queryNearby(site);
        const best:any = choose(site, features);
        if (!best) { noMatch++; continue; }
        matched++;
        const a=best.a; const npdes=String(a.SOURCE_ID||"").trim();
        if (!npdes) { noMatch++; continue; }
        const sourceUrl=`${EPA_CWA_LAYER}?f=pjson`;
        const status=a.CWP_PERMIT_STATUS_DESC || a.CWP_STATUS || undefined;
        const currentViolation=String(a.CWP_CURRENT_VIOL||"").trim();
        const snc=String(a.CWP_CURRENT_SNC_STATUS||"").trim();
        const enforcementSummary=[
          Number(a.CWP_FORMAL_EA_CNT||0)>0?`${a.CWP_FORMAL_EA_CNT} formal enforcement action(s)`:null,
          Number(a.CWP_INFORMAL_ENF_ACT_COUNT||0)>0?`${a.CWP_INFORMAL_ENF_ACT_COUNT} informal enforcement action(s)`:null,
          a.CWP_SNC_EVENT_DESC||null,
        ].filter(Boolean).join("; ") || undefined;

        const envPayload:any={
          facility_name:a.CWP_NAME || site.mine_name,
          state:"TN", county:a.CWP_COUNTY || site.county || undefined,
          msha_mine_id:site.msha_mine_id || undefined,
          epa_registry_id:a.REGISTRY_ID || undefined,
          npdes_permit_number:npdes,
          program:"CWA / NPDES",
          record_type:"EPA ECHO facility compliance snapshot",
          status:snc || currentViolation || status,
          agency:"US EPA ECHO / ICIS-NPDES",
          expiration_date:isoDate(a.CWP_EXPIRATION_DATE),
          violation_count:Number(a.CWP_QTRS_IN_NC||0) || 0,
          enforcement_action:enforcementSummary,
          latitude:Number(a.FAC_LAT)||Number(site.latitude), longitude:Number(a.FAC_LONG)||Number(site.longitude),
          source_url:sourceUrl, last_source_update:now,
          notes:`Automated federal ICIS-NPDES mirror/cross-check for Tennessee permit ${npdes}. Match basis: ${best.permitExact?"exact permit ID":`name similarity ${best.sim.toFixed(2)}, distance ${best.d.toFixed(2)} km`}. Current violation flag: ${currentViolation||"not reported"}; SNC status: ${snc||"not reported"}; inspections reported: ${a.CWP_INSPECTION_COUNT??"not reported"}. Tennessee mining permit authority is DMGR; verify transaction-grade permit documents in the DMGR viewer.`,
        };
        const envExisting=await base44.asServiceRole.entities.EnvironmentalRecord.filter({ npdes_permit_number:npdes, program:"CWA / NPDES" }, "-updated_date", 1, 0);
        if(envExisting?.[0]){await base44.asServiceRole.entities.EnvironmentalRecord.update(envExisting[0].id,envPayload);envUpdated++;}
        else{await base44.asServiceRole.entities.EnvironmentalRecord.create(envPayload);envCreated++;}

        const permitPayload:any={
          permit_number:npdes, permit_type:a.CWP_PERMIT_TYPE_DESC || "NPDES",
          facility_name:a.CWP_NAME || site.mine_name, operator_name:site.operator_name || undefined,
          status, county:a.CWP_COUNTY || site.county || undefined, state:"TN",
          latitude:Number(a.FAC_LAT)||Number(site.latitude), longitude:Number(a.FAC_LONG)||Number(site.longitude),
          msha_mine_id:site.msha_mine_id || undefined, npdes_permit_number:npdes,
          effective_date:undefined, expiration_date:isoDate(a.CWP_EXPIRATION_DATE),
          source_url:sourceUrl, last_source_update:now,
          notes:"NPDES permit identity/status refreshed from EPA ECHO ICIS-NPDES, which mirrors state-issued CWA permit data. Tennessee mining NPDES/ARAP regulatory authority is the Division of Mineral & Geologic Resources; use the DMGR permit viewer for the controlling state record and documents.",
        };
        const pExisting=await base44.asServiceRole.entities.TDECPermit.filter({ npdes_permit_number:npdes }, "-updated_date", 1, 0);
        if(pExisting?.[0]){await base44.asServiceRole.entities.TDECPermit.update(pExisting[0].id,permitPayload);permitUpdated++;}
        else{await base44.asServiceRole.entities.TDECPermit.create(permitPayload);permitCreated++;}

        const inspDate=isoDate(a.CWP_DATE_LAST_INSPECTION);
        if(inspDate){
          const iExisting=await base44.asServiceRole.entities.EnvironmentalInspection.filter({ npdes_permit_number:npdes, inspection_date:inspDate }, "-updated_date", 1, 0);
          if(!iExisting?.[0]){
            await base44.asServiceRole.entities.EnvironmentalInspection.create({ facility_name:a.CWP_NAME||site.mine_name,state:"TN",msha_mine_id:site.msha_mine_id||undefined,epa_registry_id:a.REGISTRY_ID||undefined,npdes_permit_number:npdes,agency:"US EPA ECHO / ICIS-NPDES",inspection_date:inspDate,inspection_type:"CWA/NPDES compliance inspection (latest date in ECHO snapshot)",result:currentViolation||snc||"Result not stated in map snapshot",violations_found:Boolean(currentViolation && !/^n|no$/i.test(currentViolation)),source_url:sourceUrl,last_source_update:now,notes:`ECHO reports ${a.CWP_INSPECTION_COUNT??"an unspecified number of"} inspection(s); this record stores the latest inspection date exposed by the live facility layer.`});
            inspectionsCreated++;
          }
        }

        if(!site.npdes_permit_number || String(site.npdes_permit_number).trim()!==npdes){
          await base44.asServiceRole.entities.MiningSite.update(site.id,{npdes_permit_number:npdes}); sitesLinked++;
        }
        if(sample.length<12)sample.push({mine:site.mine_name,npdes,name:a.CWP_NAME,status,distance_km:Number(best.d.toFixed(2)),name_similarity:Number(best.sim.toFixed(2))});
      } catch(error:any){errors.push({site_id:site.id,mine:site.mine_name,error:error?.message||String(error)});}
    }

    const success=errors.length < Math.max(5, Math.ceil(queried*0.25));
    const payload={last_sync_at:now,latest_source_period:now.slice(0,10),status:success?"Current":"Error",records_updated:envCreated+envUpdated,error_message:success?null:`${errors.length} site query errors`};
    await upsertFreshness(base44,"Environmental",payload);
    // TDEC status is Current only for the NPDES mirror cross-check, not a claim that all DMGR records were ingested.
    await upsertFreshness(base44,"TDEC",{...payload,records_updated:permitCreated+permitUpdated,error_message:success?"Current NPDES cross-check from EPA ICIS-NPDES; DMGR remains controlling state record source.":payload.error_message});

    if(errors.length){try{await base44.asServiceRole.entities.OperationalError.create({area:"Data",operation:"sync-tn-npdes-environmental",error_message:`${errors.length} of ${queried} EPA CWA site lookups failed. First: ${errors[0]?.error||"unknown"}`,severity:success?"Warning":"Error",status:"Open",occurred_at:now});}catch(_){}}

    return Response.json({success,source:EPA_CWA_LAYER,queried,matched,no_match:noMatch,environmental_created:envCreated,environmental_updated:envUpdated,permits_created:permitCreated,permits_updated:permitUpdated,inspections_created:inspectionsCreated,sites_linked:sitesLinked,errors:errors.slice(0,25),sample,note:"EPA ECHO/ICIS-NPDES is used as the automated federal permit/compliance mirror. Tennessee DMGR remains the controlling source for mining permit records and documents; unsupported fields are not guessed."});
  } catch(error:any){
    const msg=error?.message||String(error); console.error("sync-tn-npdes-environmental",error);
    try{await base44.asServiceRole.entities.OperationalError.create({area:"Data",operation:"sync-tn-npdes-environmental",error_message:msg,severity:"Critical",status:"Open",occurred_at:new Date().toISOString()});}catch(_){}
    return Response.json({success:false,error:msg},{status:500});
  }
}
