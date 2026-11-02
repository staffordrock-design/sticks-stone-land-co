import { createClientFromRequest } from "npm:@base44/sdk";

const SOUTHEAST = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function quarterNumber(period: unknown) {
  const match = clean(period).match(/Q([1-4])/i);
  return match ? Number(match[1]) : 0;
}

function commodityGroup(site: any, activity: any) {
  const commodity = `${clean(activity?.commodity)} ${clean(site?.commodity)} ${clean(site?.mine_name)}`.toLowerCase();
  if (commodity.includes("coal")) return null;
  if (commodity.includes("dimension stone") || commodity.includes("dimension sandstone") || commodity.includes("dimension limestone") || commodity.includes("fieldstone")) return null;
  if (/construction sand.{0,8}gravel|sand\s*(and|&)\s*gravel/.test(commodity)) return "Construction Sand and Gravel";
  if (/crushed|broken|aggregate|limestone|dolomite|granite|traprock|quartzite|chert|shale|marble/.test(commodity)) return "Crushed Stone";
  return null;
}

function roundTons(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value >= 1000000) return Math.round(value / 10000) * 10000;
  if (value >= 100000) return Math.round(value / 5000) * 5000;
  if (value >= 10000) return Math.round(value / 1000) * 1000;
  return Math.round(value / 100) * 100;
}

async function loadStateSites(base44: any, state: string) {
  const rows: any[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const page = await base44.asServiceRole.entities.MiningSite.filter({ state }, "-updated_date", 500, offset);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

async function loadActivity(base44: any) {
  const rows: any[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const page = await base44.asServiceRole.entities.ProductionRecord.filter({ record_type: "MSHA Activity" }, "-year", 500, offset);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

async function buildState(base44: any, state: string, allActivity: any[], now: string) {
  const markets = await base44.asServiceRole.entities.USGSMarketProduction.filter({ state }, "-year", 200, 0);
  if (!markets?.length) return { state, skipped: `No USGS market-production rows loaded for ${state}` };

  const sites = await loadStateSites(base44, state);
  const siteById = new Map<string, any>(sites.map((site: any) => [site.id, site]));
  const siteByMineId = new Map<string, any>();
  for (const site of sites) {
    const key = clean(site.msha_mine_id);
    if (key && !siteByMineId.has(key)) siteByMineId.set(key, site);
  }

  const stateActivity = allActivity.filter(
    (row: any) => siteById.has(row.mining_site_id) || siteByMineId.has(clean(row.msha_mine_id)),
  );
  if (!stateActivity.length) return { state, skipped: `No MSHA employment records matched ${state} mines` };

  // The MSHA quarter is the mine-level signal; the USGS quarter is the state
  // calibration total. They rarely land on the same quarter, so use the newest
  // activity quarter and the closest available USGS quarter instead of requiring
  // an exact match (which produced no estimates at all).
  const latestActivity = [...stateActivity].sort(
    (a, b) => Number(b.year || 0) - Number(a.year || 0) || quarterNumber(b.period) - quarterNumber(a.period),
  )[0];
  const activityYear = Number(latestActivity.year);
  const activityPeriod = clean(latestActivity.period);

  const sameYearMarkets = markets.filter((m: any) => Number(m.year) === activityYear);
  const marketPool = sameYearMarkets.length ? sameYearMarkets : markets;
  const market = [...marketPool].sort(
    (a: any, b: any) => Number(b.year || 0) - Number(a.year || 0) || quarterNumber(b.period) - quarterNumber(a.period),
  )[0];
  const marketYear = Number(market.year);
  const marketPeriod = clean(market.period);

  const marketForGroup = new Map<string, any>();
  for (const row of markets) {
    if (Number(row.year) === marketYear && clean(row.period) === marketPeriod) {
      marketForGroup.set(clean(row.commodity_group), row);
    }
  }

  const periodActivity = stateActivity.filter(
    (row: any) => Number(row.year) === activityYear && clean(row.period) === activityPeriod && Number(row.employee_hours || 0) > 0,
  );

  const eligible: any[] = [];
  for (const activity of periodActivity) {
    const site: any = siteById.get(activity.mining_site_id) || siteByMineId.get(clean(activity.msha_mine_id));
    if (!site) continue;
    const group = commodityGroup(site, activity);
    if (!group || !marketForGroup.get(group)) continue;
    eligible.push({ activity, site, group, hours: Number(activity.employee_hours || 0) });
  }
  if (!eligible.length) {
    return { state, skipped: `No ${state} mines had reportable ${activityPeriod} ${activityYear} hours in a calibrated commodity group`, activity_period: `${activityYear} ${activityPeriod}`, market_period: `${marketYear} ${marketPeriod}` };
  }

  const totalHoursByGroup = new Map<string, number>();
  for (const item of eligible) totalHoursByGroup.set(item.group, (totalHoursByGroup.get(item.group) || 0) + item.hours);

  let created = 0;
  let updated = 0;
  const sample: any[] = [];

  for (const item of eligible) {
    const groupHours = totalHoursByGroup.get(item.group) || 0;
    const marketRow = marketForGroup.get(item.group);
    const stateTotal = Number(marketRow?.quantity_metric_tons || 0);
    if (!(groupHours > 0) || !(stateTotal > 0)) continue;

    const share = item.hours / groupHours;
    const midpoint = stateTotal * share;
    const isStrongerSignal = item.hours >= 2000;
    const lowFactor = isStrongerSignal ? 0.65 : 0.5;
    const highFactor = isStrongerSignal ? 1.35 : 1.5;
    const confidence = isStrongerSignal ? "Medium" : "Low";
    const estimateMid = roundTons(midpoint);
    const estimateLow = roundTons(midpoint * lowFactor);
    const estimateHigh = roundTons(midpoint * highFactor);
    const mineId = clean(item.activity.msha_mine_id || item.site.msha_mine_id);
    const sourceKey = `SS-EST-${state}-${activityYear}-${activityPeriod}-${item.group.replace(/[^A-Za-z0-9]+/g, "-").toUpperCase()}-${mineId || item.site.id}`;
    const periodNote = `${activityYear} ${activityPeriod}` === `${marketYear} ${marketPeriod}`
      ? `${marketYear} ${marketPeriod}`
      : `${marketYear} ${marketPeriod} USGS quarter (nearest published to the ${activityYear} ${activityPeriod} MSHA hours)`;

    const record = {
      mining_site_id: item.site.id,
      msha_mine_id: mineId || undefined,
      mine_name: item.site.mine_name || item.activity.mine_name || "Mine / Quarry",
      year: marketYear,
      period: marketPeriod,
      commodity: item.site.commodity || item.activity.commodity || undefined,
      production_amount: estimateMid,
      production_unit: "estimated metric tons",
      employee_hours: item.hours,
      average_employees: item.activity.average_employees ?? undefined,
      source_agency: "S&S Production Model",
      source_url: marketRow.source_url,
      source_record_id: sourceKey,
      last_source_update: now,
      record_type: "S&S Estimate",
      is_estimate: true,
      estimate_low: estimateLow,
      estimate_high: estimateHigh,
      confidence,
      methodology: "SS-HOURS-SHARE-V1",
      calibration_source: marketRow.source_url,
      calibration_state_total_metric_tons: stateTotal,
      calibration_group_hours: groupHours,
      production_share_pct: Number((share * 100).toFixed(4)),
      notes: `S&S screening estimate only; not operator-reported tonnage. ${item.group} ${state} ${periodNote} USGS state production-for-consumption was ${stateTotal.toLocaleString()} metric tons. This mine represented ${Number((share * 100).toFixed(2))}% of the matched MSHA ${activityYear} ${activityPeriod} hours in the same S&S commodity group. Range widens because mine productivity varies by equipment, stripping, maintenance, automation, product mix and operating conditions.`,
    };

    const existing = await base44.asServiceRole.entities.ProductionRecord.filter({ source_record_id: sourceKey }, "-updated_date", 1, 0);
    if (existing?.[0]) {
      await base44.asServiceRole.entities.ProductionRecord.update(existing[0].id, record);
      updated++;
    } else {
      await base44.asServiceRole.entities.ProductionRecord.create(record);
      created++;
    }
    if (sample.length < 8) {
      sample.push({ state, mine_id: mineId, mine: record.mine_name, group: item.group, hours: item.hours, estimate_low: estimateLow, estimate_mid: estimateMid, estimate_high: estimateHigh, confidence });
    }
  }

  return {
    state,
    activity_period: `${activityYear} ${activityPeriod}`,
    market_period: `${marketYear} ${marketPeriod}`,
    market_period_matched_exactly: `${activityYear} ${activityPeriod}` === `${marketYear} ${marketPeriod}`,
    sites_scanned: sites.length,
    eligible_mines: eligible.length,
    group_hours: Object.fromEntries(totalHoursByGroup),
    created,
    updated,
    sample,
  };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const requested = clean(body?.state).toUpperCase();
    const states = requested ? [requested] : SOUTHEAST;

    const allActivity = await loadActivity(base44);
    if (!allActivity.length) throw new Error("No MSHA activity records are loaded. Run the MSHA employment refresh first.");

    const now = new Date().toISOString();
    const results: any[] = [];
    for (const state of states) {
      try {
        results.push(await buildState(base44, state, allActivity, now));
      } catch (error: any) {
        console.error(`build-production-estimates ${state} failed`, error);
        results.push({ state, error: error?.message || String(error) });
      }
    }

    const built = results.filter((r) => !r.skipped && !r.error);
    const created = built.reduce((sum, r) => sum + Number(r.created || 0), 0);
    const updated = built.reduce((sum, r) => sum + Number(r.updated || 0), 0);

    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "build-production-estimates",
        status: "Completed",
        summary: `S&S production model: ${created} estimates created, ${updated} updated across ${built.length} of ${results.length} requested states.`,
        occurred_at: now,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      states_requested: states,
      created,
      updated,
      states: results,
      methodology: "SS-HOURS-SHARE-V1",
      note: "Every mine-level tonnage value produced here is an S&S modeled range calibrated to USGS state production and MSHA employee hours. It is not operator-reported production, a reserve estimate, or a royalty statement.",
    });
  } catch (error: any) {
    console.error("build-production-estimates error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}