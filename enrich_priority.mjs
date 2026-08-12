const sites = [
['6a79feadace578307a31588b','394 Shale','Sullivan',36.523333,-82.307222,'4003585','Shale (mine name indicator; geology verification pending)'],
['6a79feadace578307a315881','WALKER STONE 2 LLC','Putnam',36.197778,-85.330556,'4003559','Stone (mine name indicator; geology verification pending)'],
['6a79feadace578307a3158a7','SEVEN SPRINGS FIELDSTONE','Marion',35.233889,-85.516111,'4003624','Fieldstone (mine name indicator; geology verification pending)'],
['6a79feadace578307a315875','Jake Copeland Quarries','Cumberland',35.846389,-84.991389,'4003536',''],
['6a79fe40925c52c762c59a4e','Lynchburg Quarry','Moore',35.308056,-86.401389,'4002160',''],
['6a79fe7a10a8a0bb0c431980','Quarry 109','Wilson',36.182778,-86.419444,'4003119',''],
['6a79feadace578307a31589e','Rockvale','Rutherford',35.781389,-86.499167,'4003612',''],
['6a79feadace578307a315899','PCS of TN Mine','Marshall',35.582778,-86.773889,'4003607',''],
['6a79feadace578307a315888','Jones Robertson County Quarry','Robertson',36.531667,-86.649167,'4003576',''],
['6a79fe40925c52c762c59a2c','MCLEAN SAND PLANT','Shelby',35.179167,-89.994167,'4000775',''],
['6a79fe40925c52c762c59a52','Baldwin Plant','Anderson',36.148333,-84.385833,'4002467',''],
['6a79fe40925c52c762c59a39','Preparation Plant','Marion',35.276111,-85.5575,'4001144',''],
['6a79fe40925c52c762c59a02','Bostick Quarry','Franklin',35.245278,-86.048333,'4000034',''],
['6a79fe40925c52c762c59a12','Algood Quarry','Putnam',36.198611,-85.440833,'4000079',''],
['6a79fe40925c52c762c59a4c','UNICOI QUARRY','Unicoi',36.24,-82.303611,'4002075',''],
['6a79fe40925c52c762c59a44','Chesney Surface','Union',36.226944,-83.711944,'4001574',''],
['6a79fe40925c52c762c59a3c','Overton County Quarry Tennessee','Overton',36.360833,-85.314167,'4001177',''],
['6a79fe7a10a8a0bb0c43197b','Deadfall Pit','Shelby',35.357778,-89.725,'4003105',''],
['6a79fe7a10a8a0bb0c431973','Collins and Rich Pits','Weakley',36.210556,-88.649444,'4003051',''],
['6a79fe7a10a8a0bb0c4319bd','Kitty Hollow South','Rhea',35.730833,-84.767778,'4003472',''],
['6a79fe7a10a8a0bb0c4319bc','HWY 84 LIMESTONE LLC','Putnam',36.168056,-85.281111,'4003470',''],
['6a79fe7a10a8a0bb0c4319ba','Hood Quarry','Fentress',36.497222,-85.021944,'4003464',''],
['6a79fe7a10a8a0bb0c4319b9','Brown Town Quarry','Cumberland',35.959444,-85.205,'4003463',''],
['6a79fe7a10a8a0bb0c4319b5','Fire Tower Mine','Van Buren',35.678611,-85.316944,'4003420',''],
['6a79fe7a10a8a0bb0c4319b0','Long Excavating and Hauling LLC','Grainger',36.369444,-83.440556,'4003400',''],
['6a79fe7a10a8a0bb0c4319ab','Walker Stone','Overton',36.275556,-85.305,'4003382',''],
['6a79fe7a10a8a0bb0c4319a9','Crab Orchard Stone Pleasant Hill Quarry','Cumberland',35.906111,-85.043333,'4003361',''],
['6a79fe7a10a8a0bb0c4319a6','Bedrock Quarry and Gravel','Hardin',35.156389,-88.129167,'4003354',''],
['6a79fe7a10a8a0bb0c431998','Middle Quarry','Johnson',36.318333,-81.975278,'4003284',''],
['6a79fe7a10a8a0bb0c431992','Big Lick Quarry','Cumberland',35.825,-85.034167,'4003242',''],
['6a79fe7a10a8a0bb0c431991','Mine #1','Wayne',35.378611,-87.937222,'4003223',''],
['6a79feadace578307a3158b7','Wright Way #1','Lincoln',35.153122,-86.513245,'4003643',''],
['6a79feadace578307a315894','Johnson Construction Company','Hardin',35.193056,-88.198056,'4003601','']
];
const parcelBase='https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0/query';
const geoBase='https://services4.arcgis.com/QdHwhlbx61LR3TWb/arcgis/rest/services/TN_Geology/FeatureServer/0/query';
const out=[];
async function enrich([id,name,county,lat,lng,msha,commodity]){
  let parcel=null, geology=null;
  try {
    const p=new URLSearchParams({f:'geojson',where:'1=1',geometry:`${lng},${lat}`,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'GISLINK,GISLINK2,CALC_ACRE,COUNTY_ID,PARCEL_TYPE,PARCELWP',returnGeometry:'true',outSR:'4326',resultRecordCount:'1'});
    const d=await (await fetch(`${parcelBase}?${p}`,{signal:AbortSignal.timeout(30000)})).json();
    const f=d?.features?.[0];
    if(f){let ring=[]; if(f.geometry?.type==='Polygon') ring=f.geometry.coordinates?.[0]||[]; else if(f.geometry?.type==='MultiPolygon') ring=f.geometry.coordinates?.[0]?.[0]||[]; parcel={parcel_id:String(f.properties?.GISLINK||f.properties?.GISLINK2||'').trim(), tax_map:String(f.properties?.GISLINK||'').trim().slice(3,6).trim()||null, parcel_workpaper:String(f.properties?.PARCELWP||'').trim()||null, county_id:Number(f.properties?.COUNTY_ID)||null, acreage:Number(f.properties?.CALC_ACRE)||null, boundary_polygon:ring.map(([x,y])=>({lat:Number(y),lng:Number(x)})).filter(q=>Number.isFinite(q.lat)&&Number.isFinite(q.lng))};}
  } catch(e){parcel={error:String(e)}}
  try {
    const p=new URLSearchParams({f:'json',geometry:`${lng},${lat}`,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'ORIG_LABEL,SGMC_LABEL,UNIT_LINK,SOURCE,UNIT_AGE,ROCKTYPE1,ROCKTYPE2',returnGeometry:'false'});
    const url=`${geoBase}?${p}`; const d=await (await fetch(url,{signal:AbortSignal.timeout(30000)})).json(); const a=d?.features?.[0]?.attributes;
    if(a) geology={primary_rock:a.ROCKTYPE1||null,secondary_rock:a.ROCKTYPE2||null,geologic_unit:a.SGMC_LABEL||a.ORIG_LABEL||null,formation_name:a.UNIT_LINK||null,geologic_age:a.UNIT_AGE||null,source_url:url,orig_label:a.ORIG_LABEL||null,source_code:a.SOURCE||null};
  } catch(e){geology={error:String(e)}}
  return {id,name,county,lat,lng,msha,commodity,parcel,geology};
}
for(let i=0;i<sites.length;i+=8){ const batch=sites.slice(i,i+8); out.push(...await Promise.all(batch.map(enrich))); }
await import('node:fs').then(fs=>fs.writeFileSync('/app/enrichment_results.json', JSON.stringify(out)));
console.log(JSON.stringify({count:out.length,parcelMatched:out.filter(x=>x.parcel?.parcel_id).length,geologyMatched:out.filter(x=>x.geology?.primary_rock||x.geology?.geologic_unit).length,parcelNoMatch:out.filter(x=>!x.parcel?.parcel_id).map(x=>x.name),geoNoMatch:out.filter(x=>!x.geology).map(x=>x.name)}));
