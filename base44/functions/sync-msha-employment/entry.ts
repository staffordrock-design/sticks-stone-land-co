import { createClientFromRequest } from "npm:@base44/sdk";
import { unzipSync, strFromU8 } from "npm:fflate";

const DATA_URL = "https://arlweb.msha.gov/OpenGovernmentData/DataSets/MinesProdQuarterly.zip";
const SOURCE_PAGE = "https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseDelimited(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [] as Record<string, string>[];
  const headers = lines[0].split("|").map((h) => h.trim().replace(/^\uFEFF/, ""));
  return lines.slice(1).map((line) => {
    const cells = line.split("|").map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ""; });
    return row;
  });
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const response = await fetch(DATA_URL, { headers: { "User-Agent": "SSRockHoldings/1.0" } });
    if (!response.ok) throw new Error(`MSHA quarterly employment download failed: ${response.status}`);

    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const fileName = Object.keys(archive).find((name) => /\.(txt|csv|dat)$/i.test(name)) || Object.keys(archive)[0];
    if (!fileName) throw new Error("MSHA quarterly employment archive contained no data file");
    const rows = parseDelimited(strFromU8(archive[fileName]));

    const available = new Set<string>();
    for (const row of rows) {
      if (clean(row.STATE).toUpperCase() !== "TN") continue;
      if (/^C/i.test(clean(row.COAL_METAL_IND))) continue;
      const year = num(row.CAL_YR);
      const quarter = num(row.CAL_QTR);
      if (year > 0 && quarter >= 1 && quarter <= 4) available.add(`${year}-Q${quarter}`);
    }
    const periods = [...available]
      .map((value) => {
        const match = value.match(/^(\d{4})-Q([1-4])$/)!;
        return { year: Number(match[1]), quarter: Number(match[2]), key: value };
      })
      .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
      .slice(0, 2);
    if (!periods.length) throw new Error("No current Tennessee metal/nonmetal employment periods found");
    const periodKeys = new Set(periods.map((p) => p.key));

    const grouped = new Map<string, any>();
    for (const row of rows) {
      if (clean(row.STATE).toUpperCase() !== "TN") continue;
      if (/^C/i.test(clean(row.COAL_METAL_IND))) continue;
      const year = num(row.CAL_YR);
      const quarter = num(row.CAL_QTR);
      const periodKey = `${year}-Q${quarter}`;
      if (!periodKeys.has(periodKey)) continue;
      const mineId = clean(row.MINE_ID);
      if (!mineId) continue;
      const groupKey = `${periodKey}:${mineId}`;
      const current = grouped.get(groupKey) || {
        year,
        quarter,
        mineId,
        mineName: clean(row.CURR_MINE_NM || row.MINE_NAME),
        hours: 0,
        employees: 0,
        subunits: new Set<string>(),
      };
      current.hours += num(row.HOURS_WORKED);
      current.employees += num(row.AVG_EMPLOYEE_CNT);
      if (clean(row.SUBUNIT)) current.subunits.add(clean(row.SUBUNIT));
      if (!current.mineName) current.mineName = clean(row.CURR_MINE_NM || row.MINE_NAME);
      grouped.set(groupKey, current);
    }

    const sites = await base44.asServiceRole.entities.MiningSite.filter({ state: "TN" }, "-updated_date", 500, 0);
    const siteByMineId = new Map<string, any>();
    for (const site of sites || []) {
      const key = clean(site.msha_mine_id);
      if (key && !siteByMineId.has(key)) siteByMineId.set(key, site);
    }

    let created = 0;
    let updated = 0;
    let matched = 0;
    let zeroHours = 0;
    const periodStats = new Map<string, { matched: number; created: number; updated: number }>();
    const sample: any[] = [];
    const now = new Date().toISOString();

    for (const item of grouped.values()) {
      const site = siteByMineId.get(item.mineId);
      if (!site) continue;
      matched++;
      if (!(item.hours > 0)) zeroHours++;
      const period = `Q${item.quarter}`;
      const periodKey = `${item.year}-${period}`;
      const stats = periodStats.get(periodKey) || { matched: 0, created: 0, updated: 0 };
      stats.matched++;
      const sourceKey = `MSHA-OG-QTR-${item.year}-${period}-${item.mineId}`;
      const record = {
        mining_site_id: site.id,
        msha_mine_id: item.mineId,
        mine_name: item.mineName || site.mine_name || `MSHA ${item.mineId}`,
        year: item.year,
        period,
        commodity: site.commodity || undefined,
        production_amount: null,
        production_unit: "Metal/nonmetal tonnage is not reported to MSHA",
        employee_hours: item.hours,
        average_employees: Number(item.employees.toFixed(2)),
        source_agency: "MSHA Part 50",
        source_url: SOURCE_PAGE,
        source_record_id: sourceKey,
        last_source_update: now,
        record_type: "MSHA Activity",
        is_estimate: false,
        notes: `Official MSHA quarterly employment record. Mine subunits included: ${[...item.subunits].join(", ") || "not stated"}. Average employee counts are summed across reported subunits and are shown only as context. Metal/nonmetal operators are not required to report production tonnage to MSHA; S&S uses employee hours as the primary activity signal.`,
      };
      const existing = await base44.asServiceRole.entities.ProductionRecord.filter({ source_record_id: sourceKey }, "-updated_date", 1, 0);
      if (existing?.[0]) {
        await base44.asServiceRole.entities.ProductionRecord.update(existing[0].id, record);
        updated++;
        stats.updated++;
      } else {
        await base44.asServiceRole.entities.ProductionRecord.create(record);
        created++;
        stats.created++;
      }
      periodStats.set(periodKey, stats);
      if (sample.length < 12) sample.push({ year: item.year, period, mine_id: item.mineId, mine: record.mine_name, hours: item.hours });
    }

    const latest = periods[0];
    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "sync-msha-employment",
        status: "Completed",
        summary: `MSHA Part 50 refreshed ${periods.map((p) => `${p.year} Q${p.quarter}`).join(" + ")}: ${matched} Tennessee mine-period matches; ${created} created, ${updated} updated.`,
        occurred_at: now,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      source: DATA_URL,
      source_page: SOURCE_PAGE,
      year: latest.year,
      quarter: latest.quarter,
      periods: periods.map((p) => ({ year: p.year, quarter: p.quarter, ...(periodStats.get(`${p.year}-Q${p.quarter}`) || { matched: 0, created: 0, updated: 0 }) })),
      matched,
      created,
      updated,
      zero_hours: zeroHours,
      sample,
      note: "S&S keeps the newest two MSHA metal/nonmetal quarters so production modeling can match the latest USGS quarter exactly. MSHA production tonnage is not reported; employee hours are the primary mine-level activity signal.",
    });
  } catch (error: any) {
    console.error("sync-msha-employment error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
