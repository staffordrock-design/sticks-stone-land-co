import { createClient } from '@base44/sdk';
import { unzipSync, strFromU8 } from 'fflate';
import fs from 'node:fs';

const appId = '6a78376a454093ba2f431acd';
const b = createClient({ appId });
const MSHA_ZIP = 'https://arlweb.msha.gov/OpenGovernmentData/DataSets/MinesProdQuarterly.zip';
const MSHA_PAGE = 'https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp';
const now = new Date().toISOString();

const clean = (v) => String(v ?? '').trim();
const num = (v) => { const n = Number(clean(v).replace(/,/g,'')); return Number.isFinite(n) ? n : 0; };

function parsePipe(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split('|').map(x => x.replace(/^\uFEFF/,'').trim());
  return lines.slice(1).map(line => {
    const cells = line.split('|').map(x => x.replace(/^"|"$/g,'').replace(/""/g,'"'));
    const row = {}; headers.forEach((h,i)=>row[h]=cells[i] ?? ''); return row;
  });
}

function groupFor(site) {
  const text = `${site.commodity || ''} ${site.mine_name || ''}`.toLowerCase();
  if (text.includes('coal')) return null;
  if (text.includes('dimension stone') || text.includes('dimension sandstone') || text.includes('dimension limestone') || text.includes('fieldstone')) return null;
  if (/construction sand.{0,8}gravel|sand\s*(and|&)\s*gravel/.test(text)) return 'Construction Sand and Gravel';
  if (/crushed|broken|aggregate|limestone|dolomite|granite|traprock|quartzite|chert|shale|marble/.test(text)) return 'Crushed Stone';
  return null;
}
function roundTons(v) {
  if (v >= 1_000_000) return Math.round(v/10000)*10000;
  if (v >= 100_000) return Math.round(v/5000)*5000;
  if (v >= 10_000) return Math.round(v/1000)*1000;
  return Math.round(v/100)*100;
}

const resp = await fetch(MSHA_ZIP, { headers: {'User-Agent':'SSRockHoldings/1.0'} });
if (!resp.ok) throw new Error(`MSHA download ${resp.status}`);
const zip = unzipSync(new Uint8Array(await resp.arrayBuffer()));
const txtName = Object.keys(zip).find(n => n.endsWith('.txt'));
const rows = parsePipe(strFromU8(zip[txtName]));

let latestYear=0, latestQuarter=0;
for (const r of rows) {
  if (clean(r.STATE).toUpperCase() !== 'TN' || clean(r.COAL_METAL_IND).toUpperCase() === 'C') continue;
  const y=num(r.CAL_YR), q=num(r.CAL_QTR);
  if (y>latestYear || (y===latestYear && q>latestQuarter)) { latestYear=y; latestQuarter=q; }
}

const official = new Map();
for (const r of rows) {
  if (clean(r.STATE).toUpperCase() !== 'TN' || clean(r.COAL_METAL_IND).toUpperCase() === 'C') continue;
  if (num(r.CAL_YR)!==latestYear || num(r.CAL_QTR)!==latestQuarter) continue;
  const id=clean(r.MINE_ID); if (!id) continue;
  const x=official.get(id) || {mine_id:id, mine_name:clean(r.CURR_MINE_NM), hours:0, employees:0, subunits:new Set()};
  x.hours += num(r.HOURS_WORKED); x.employees += num(r.AVG_EMPLOYEE_CNT); if (clean(r.SUBUNIT)) x.subunits.add(clean(r.SUBUNIT)); official.set(id,x);
}

const statuses = ['Active','Intermittent','Temporarily Idled','NonProducing','New Mine'];
const sites = await b.entities.MiningSite.filter({state:'TN', mine_status:{$in:statuses}}, 'msha_mine_id', 500, 0);
const byId = new Map(sites.filter(s=>s.msha_mine_id).map(s=>[clean(s.msha_mine_id),s]));
const markets = await b.entities.USGSMarketProduction.filter({state:'TN',year:latestYear,period:`Q${latestQuarter}`}, 'commodity_group', 20, 0);
const marketByGroup = new Map(markets.map(m=>[m.commodity_group,m]));

const activity = [];
const eligible = [];
for (const [id,x] of official) {
  const site=byId.get(id); if (!site) continue;
  const rec={
    mining_site_id:site.id, msha_mine_id:id, mine_name:site.mine_name || x.mine_name,
    year:latestYear, period:`Q${latestQuarter}`, commodity:site.commodity || undefined,
    production_unit:'Metal/nonmetal tonnage is not reported to MSHA', employee_hours:x.hours,
    average_employees:Number(x.employees.toFixed(2)), source_agency:'MSHA Part 50', source_url:MSHA_PAGE,
    source_record_id:`MSHA-OG-QTR-${latestYear}-Q${latestQuarter}-${id}`, last_source_update:now,
    record_type:'MSHA Activity', is_estimate:false,
    notes:`Official MSHA quarterly employment record. Mine subunits: ${[...x.subunits].join(', ') || 'not stated'}. Metal/nonmetal operators are not required to report production tonnage to MSHA; S&S uses employee hours only as an activity signal.`
  };
  activity.push(rec);
  const group=groupFor(site); if (group && x.hours>0 && marketByGroup.has(group)) eligible.push({site,x,group});
}

const groupHours={};
for (const e of eligible) groupHours[e.group]=(groupHours[e.group]||0)+e.x.hours;
const estimates=[];
for (const e of eligible) {
  const market=marketByGroup.get(e.group), gh=groupHours[e.group], share=e.x.hours/gh, mid=Number(market.quantity_metric_tons)*share;
  const strong=e.x.hours>=2000 && e.x.employees>=2, lowF=strong?0.65:0.5, highF=strong?1.35:1.5;
  const id=clean(e.site.msha_mine_id);
  estimates.push({
    mining_site_id:e.site.id,msha_mine_id:id,mine_name:e.site.mine_name,year:latestYear,period:`Q${latestQuarter}`,commodity:e.site.commodity || undefined,
    production_amount:roundTons(mid),production_unit:'estimated metric tons',employee_hours:e.x.hours,average_employees:Number(e.x.employees.toFixed(2)),
    source_agency:'S&S Production Model',source_url:market.source_url,source_record_id:`SS-EST-TN-${latestYear}-Q${latestQuarter}-${e.group.replace(/[^A-Za-z0-9]+/g,'-').toUpperCase()}-${id}`,
    last_source_update:now,record_type:'S&S Estimate',is_estimate:true,estimate_low:roundTons(mid*lowF),estimate_high:roundTons(mid*highF),confidence:strong?'Medium':'Low',
    methodology:'SS-HOURS-SHARE-V1',calibration_source:market.source_url,calibration_state_total_metric_tons:Number(market.quantity_metric_tons),calibration_group_hours:gh,
    production_share_pct:Number((share*100).toFixed(4)),
    notes:`S&S screening estimate only; not operator-reported tonnage. ${e.group} Tennessee ${latestYear} Q${latestQuarter} USGS state production-for-consumption was ${Number(market.quantity_metric_tons).toLocaleString()} metric tons. This mine represented ${(share*100).toFixed(2)}% of matched MSHA hours in the same S&S commodity group. Range reflects productivity uncertainty.`
  });
}

const payload={summary:{latestYear,latestQuarter,officialTnMnmMines:official.size,currentSites:sites.length,matchedActivity:activity.length,eligibleEstimates:estimates.length,groupHours,markets:markets.map(m=>({group:m.commodity_group,tons:m.quantity_metric_tons}))},activity,estimates};
fs.writeFileSync('/tmp/production_payload.json', JSON.stringify(payload));
fs.writeFileSync('/tmp/activity1.json', JSON.stringify(activity.slice(0,100)));
fs.writeFileSync('/tmp/activity2.json', JSON.stringify(activity.slice(100,200)));
fs.writeFileSync('/tmp/activity3.json', JSON.stringify(activity.slice(200)));
fs.writeFileSync('/tmp/estimate1.json', JSON.stringify(estimates.slice(0,100)));
fs.writeFileSync('/tmp/estimate2.json', JSON.stringify(estimates.slice(100,200)));
fs.writeFileSync('/tmp/estimate3.json', JSON.stringify(estimates.slice(200)));
console.log(JSON.stringify(payload.summary,null,2));
console.log('TOP ESTIMATES');
console.log(JSON.stringify([...estimates].sort((a,b)=>b.production_amount-a.production_amount).slice(0,15).map(x=>({id:x.msha_mine_id,mine:x.mine_name,hours:x.employee_hours,low:x.estimate_low,mid:x.production_amount,high:x.estimate_high,group:x.commodity})),null,2));
