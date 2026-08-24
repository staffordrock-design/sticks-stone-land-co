import { createClientFromRequest } from "npm:@base44/sdk";

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

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const state = clean(body?.state || "TN").toUpperCase();

    const markets = await base44.asServiceRole.entities.USGSMarketProduction.filter({ state }, "-year", 30, 0);
    if (!markets?.length) throw new Error(`No USGS market-production records are loaded for ${state}`);

    const latest = [...markets].sort((a: any, b: any) => Number(b.year || 0) - Number(a.year || 0) || quarterNumber(b.period) - quarterNumber(a.period))[0];
    const year = Number(latest.year);
    const period = clean(latest.period);
    const marketForGroup = new Map<string, any>();
    for (const row of markets) {
      if (Number(row.year) === year && clean(row.period) === period) marketForGroup.set(clean(row.commodity_group), row);
    }

    const activities = await base44.asServiceRole.entities.ProductionRecord.filter({
      year,
      period,
      record_type: "MSHA Activity",
    }, "-employee_hours", 500, 0);
    if (!activities?.length) throw new Error(`No MSHA activity records are loaded for ${year} ${period}. Run the MSHA employment refresh first.`);

    const sites = await base44.asServiceRole.entities.MiningSite.filter({ state }, "-updated_date", 500, 0);
    const siteById = new Map((sites || []).map((site: any) => [site.id, site]));
    const siteByMineId = new Map((sites || []).filter((site: any) => site.msha_mine_id).map((site: any) => [clean(site.msha_mine_id), site]));

    const eligible: any[] = [];
    for (const activity of activities) {
      const hours = Number(activity.employee_hours || 0);
      if (!(hours > 0)) continue;
      const site: any = siteById.get(activity.mining_site_id) || siteByMineId.get(clean(activity.msha_mine_id));
      if (!site) continue;
      const group = commodityGroup(site, activity);
      if (!group || !marketForGroup.get(group)) continue;
      eligible.push({ activity, site, group, hours });
    }

    const totalHoursByGroup = new Map<string, number>();
    for (const item of eligible) totalHoursByGroup.set(item.group, (totalHoursByGroup.get(item.group) || 0) + item.hours);

    let created = 0;
    let updated = 0;
    const sample: any[] = [];
    const now = new Date().toISOString();

    for (const item of eligible) {
      const market = marketForGroup.get(item.group);
      const groupHours = totalHoursByGroup.get(item.group) || 0;
      if (!(groupHours > 0) || !(Number(market.quantity_metric_tons) > 0)) continue;

      const share = item.hours / groupHours;
      const midpoint = Number(market.quantity_metric_tons) * share;
      const isStrongerSignal = item.hours >= 2000;
      const lowFactor = isStrongerSignal ? 0.65 : 0.5;
      const highFactor = isStrongerSignal ? 1.35 : 1.5;
      const confidence = isStrongerSignal ? "Medium" : "Low";
      const estimateMid = roundTons(midpoint);
      const estimateLow = roundTons(midpoint * lowFactor);
      const estimateHigh = roundTons(midpoint * highFactor);
      const mineId = clean(item.activity.msha_mine_id || item.site.msha_mine_id);
      const sourceKey = `SS-EST-${state}-${year}-${period}-${item.group.replace(/[^A-Za-z0-9]+/g, "-").toUpperCase()}-${mineId || item.site.id}`;

      const record = {
        mining_site_id: item.site.id,
        msha_mine_id: mineId || undefined,
        mine_name: item.site.mine_name || item.activity.mine_name || "Mine / Quarry",
        year,
        period,
        commodity: item.site.commodity || item.activity.commodity || undefined,
        production_amount: estimateMid,
        production_unit: "estimated metric tons",
        employee_hours: item.hours,
        average_employees: item.activity.average_employees ?? undefined,
        source_agency: "S&S Production Model",
        source_url: market.source_url,
        source_record_id: sourceKey,
        last_source_update: now,
        record_type: "S&S Estimate",
        is_estimate: true,
        estimate_low: estimateLow,
        estimate_high: estimateHigh,
        confidence,
        methodology: "SS-HOURS-SHARE-V1",
        calibration_source: market.source_url,
        calibration_state_total_metric_tons: Number(market.quantity_metric_tons),
        calibration_group_hours: groupHours,
        production_share_pct: Number((share * 100).toFixed(4)),
        notes: `S&S screening estimate only; not operator-reported tonnage. ${item.group} ${state} ${year} ${period} USGS state production-for-consumption was ${Number(market.quantity_metric_tons).toLocaleString()} metric tons. This mine represented ${Number((share * 100).toFixed(2))}% of the matched MSHA hours in the same S&S commodity group. Range widens because mine productivity varies by equipment, stripping, maintenance, automation, product mix and operating conditions.`,
      };

      const existing = await base44.asServiceRole.entities.ProductionRecord.filter({ source_record_id: sourceKey }, "-updated_date", 1, 0);
      if (existing?.[0]) {
        await base44.asServiceRole.entities.ProductionRecord.update(existing[0].id, record);
        updated++;
      } else {
        await base44.asServiceRole.entities.ProductionRecord.create(record);
        created++;
      }
      if (sample.length < 15) sample.push({ mine_id: mineId, mine: record.mine_name, group: item.group, hours: item.hours, estimate_low: estimateLow, estimate_mid: estimateMid, estimate_high: estimateHigh, confidence });
    }

    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "build-production-estimates",
        status: "Completed",
        summary: `S&S production model ${state} ${year} ${period}: ${created} estimates created, ${updated} updated from ${eligible.length} eligible MSHA activity records.`,
        occurred_at: now,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      state,
      year,
      period,
      eligible_activity_records: eligible.length,
      group_hours: Object.fromEntries(totalHoursByGroup),
      created,
      updated,
      sample,
      methodology: "SS-HOURS-SHARE-V1",
      note: "Every mine-level tonnage value produced here is an S&S modeled range calibrated to USGS state production and MSHA employee hours. It is not operator-reported production, a reserve estimate, or a royalty statement.",
    });
  } catch (error: any) {
    console.error("build-production-estimates error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}