import { createClientFromRequest } from "npm:@base44/sdk";

const DATA_URL = "https://arlweb.msha.gov/OpenGovernmentData/DataSets/MinesProdQuarterly.zip";
const SOURCE_PAGE = "https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp";
const SOUTHEAST = new Set(["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

// The MSHA archive expands to hundreds of megabytes, so unzip it as a stream and
// keep only the Southeast metal/nonmetal rows instead of loading it all at once.
function findZipEntry(buffer: Uint8Array, matcher: RegExp) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let eocd = -1;
  const floor = Math.max(0, buffer.length - 66000);
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("MSHA archive central directory not found");
  const entries = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = new TextDecoder().decode(buffer.subarray(pointer + 46, pointer + 46 + nameLength));
    if (matcher.test(name)) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      return { name, method, compressedSize, dataStart: localOffset + 30 + localNameLength + localExtraLength };
    }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("MSHA archive contained no data file");
}

async function collectSoutheastRows(archive: Uint8Array) {
  const entry = findZipEntry(archive, /\.(txt|csv|dat)$/i);
  const compressed = archive.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  let stream: ReadableStream<Uint8Array> = new Blob([compressed]).stream();
  if (entry.method !== 0) {
    stream = stream.pipeThrough(new DecompressionStream("deflate-raw" as any));
  }
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  const rows: any[] = [];
  const earliestYear = new Date().getFullYear() - 1;
  let headerIndex: Record<string, number> | null = null;
  let pending = "";
  let truncated = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const cells = line.split("|");
    if (!headerIndex) {
      headerIndex = {};
      cells.forEach((header, index) => {
        headerIndex![header.trim().replace(/^\uFEFF/, "")] = index;
      });
      return;
    }
    if (truncated || rows.length >= 400000) { truncated = true; return; }
    const stateIndex = headerIndex.STATE ?? 0;
    const state = clean(cells[stateIndex]).replace(/^"|"$/g, "").toUpperCase();
    if (!SOUTHEAST.has(state)) return;
    const coalMetal = clean(cells[headerIndex.COAL_METAL_IND ?? -1]).replace(/^"|"$/g, "");
    if (/^C/i.test(coalMetal)) return;
    const year = num(cells[headerIndex.CAL_YR ?? -1]);
    const quarter = num(cells[headerIndex.CAL_QTR ?? -1]);
    if (!(year >= earliestYear) || !(quarter >= 1 && quarter <= 4)) return;
    const mineId = clean(cells[headerIndex.MINE_ID ?? -1]).replace(/^"|"$/g, "");
    if (!mineId) return;
    rows.push({
      state,
      year,
      quarter,
      mineId,
      name: (clean(cells[headerIndex.CURR_MINE_NM ?? -1]) || clean(cells[headerIndex.MINE_NAME ?? -1])).replace(/^"|"$/g, ""),
      hours: num(cells[headerIndex.HOURS_WORKED ?? -1]),
      employees: num(cells[headerIndex.AVG_EMPLOYEE_CNT ?? -1]),
      subunit: clean(cells[headerIndex.SUBUNIT ?? -1]),
    });
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    let index = pending.indexOf("\n");
    while (index >= 0) {
      handleLine(pending.slice(0, index).replace(/\r$/, ""));
      pending = pending.slice(index + 1);
      index = pending.indexOf("\n");
    }
  }
  if (pending) handleLine(pending.replace(/\r$/, ""));
  return { rows, truncated };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const response = await fetch(DATA_URL, { headers: { "User-Agent": "SSRockHoldings/1.0" } });
    if (!response.ok) throw new Error(`MSHA quarterly employment download failed: ${response.status}`);
    const archive = new Uint8Array(await response.arrayBuffer());
    const { rows, truncated } = await collectSoutheastRows(archive);
    if (!rows.length) throw new Error("No Southeast metal/nonmetal employment rows found in the MSHA archive");

    // Newest two quarters actually present for the Southeast.
    const periods = [...new Set(rows.map((row) => `${row.year}-Q${row.quarter}`))]
      .map((value) => {
        const match = value.match(/^(\d{4})-Q([1-4])$/)!;
        return { year: Number(match[1]), quarter: Number(match[2]), key: value };
      })
      .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
      .slice(0, 2);
    const periodKeys = new Set(periods.map((period) => period.key));

    const grouped = new Map<string, any>();
    for (const row of rows) {
      const periodKey = `${row.year}-Q${row.quarter}`;
      if (!periodKeys.has(periodKey)) continue;
      const groupKey = `${periodKey}:${row.mineId}`;
      const current = grouped.get(groupKey) || {
        year: row.year,
        quarter: row.quarter,
        mineId: row.mineId,
        mineName: row.name,
        hours: 0,
        employees: 0,
        subunits: new Set<string>(),
      };
      current.hours += row.hours;
      current.employees += row.employees;
      if (row.subunit) current.subunits.add(row.subunit);
      if (!current.mineName && row.name) current.mineName = row.name;
      grouped.set(groupKey, current);
    }

    // Every Southeast state, every page: the model needs each state's mine set.
    const siteByMineId = new Map<string, any>();
    let sitesScanned = 0;
    for (const code of SOUTHEAST) {
      for (let offset = 0; offset < 20000; offset += 500) {
        const page = await base44.asServiceRole.entities.MiningSite.filter({ state: code }, "-updated_date", 500, offset);
        for (const site of page || []) {
          sitesScanned++;
          const key = clean(site.msha_mine_id);
          if (key && !siteByMineId.has(key)) siteByMineId.set(key, site);
        }
        if (!page || page.length < 500) break;
      }
    }

    // One pass over this job's own records instead of a query per mine.
    const existingByKey = new Map<string, any>();
    for (let offset = 0; offset < 20000; offset += 500) {
      const page = await base44.asServiceRole.entities.ProductionRecord.filter({ record_type: "MSHA Activity" }, "-year", 500, offset);
      for (const record of page || []) {
        if (record.source_record_id) existingByKey.set(String(record.source_record_id), record);
      }
      if (!page || page.length < 500) break;
    }

    let matched = 0;
    let zeroHours = 0;
    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    const periodStats = new Map<string, { matched: number; created: number; updated: number }>();
    const stateStats = new Map<string, number>();
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
      stateStats.set(site.state, (stateStats.get(site.state) || 0) + 1);
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
      const existing = existingByKey.get(sourceKey);
      if (existing?.id) {
        toUpdate.push({ id: existing.id, ...record });
        stats.updated++;
      } else {
        toCreate.push(record);
        stats.created++;
      }
      periodStats.set(periodKey, stats);
      if (sample.length < 12) sample.push({ state: site.state, year: item.year, period, mine_id: item.mineId, mine: record.mine_name, hours: item.hours });
    }

    for (let i = 0; i < toCreate.length; i += 500) {
      await base44.asServiceRole.entities.ProductionRecord.bulkCreate(toCreate.slice(i, i + 500));
    }
    for (let i = 0; i < toUpdate.length; i += 500) {
      await base44.asServiceRole.entities.ProductionRecord.bulkUpdate(toUpdate.slice(i, i + 500));
    }

    const latest = periods[0];
    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "sync-msha-employment",
        status: "Completed",
        summary: `MSHA Part 50 refreshed ${periods.map((p) => `${p.year} Q${p.quarter}`).join(" + ")}: ${matched} Southeast mine-period matches across ${stateStats.size} states; ${toCreate.length} created, ${toUpdate.length} updated.`,
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
      candidate_rows_scanned: rows.length,
      rows_truncated: truncated,
      sites_scanned: sitesScanned,
      matched,
      created: toCreate.length,
      updated: toUpdate.length,
      zero_hours: zeroHours,
      matched_by_state: Object.fromEntries(stateStats),
      sample,
      note: "S&S keeps the newest two MSHA metal/nonmetal quarters for every Southeast state so production modeling can meet the latest USGS quarter. MSHA production tonnage is not reported; employee hours are the primary mine-level activity signal.",
    });
  } catch (error: any) {
    console.error("sync-msha-employment error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}