import { createClientFromRequest } from "npm:@base44/sdk";
import { unzipSync, strFromU8 } from "npm:fflate";

const AETABLE = "https://arlweb.msha.gov/STATS/PART50/P50Y2K/AETABLE.HTM";
const BASE = "https://arlweb.msha.gov/STATS/PART50/P50Y2K/";

function field(line: string, start: number, end: number) {
  return line.slice(start - 1, end).trim();
}

function numField(line: string, start: number, end: number) {
  const raw = field(line, start, end);
  if (!raw || !/^\d+$/.test(raw)) return 0;
  return Number(raw);
}

function quarterTotals(line: string, quarter: number) {
  const layouts: Record<number, Array<[number, number, number, number]>> = {
    1: [[298,302,303,310],[440,444,445,452],[582,586,587,594],[724,728,729,736]],
    2: [[333,337,338,345],[475,479,480,487],[617,621,622,629],[759,763,764,771]],
    3: [[368,372,373,380],[510,514,515,522],[652,656,657,664],[794,798,799,806]],
    4: [[403,407,408,415],[545,549,550,557],[687,691,692,699],[829,833,834,841]],
  };
  let employees = 0;
  let hours = 0;
  for (const [es, ee, hs, he] of layouts[quarter] || []) {
    employees += numField(line, es, ee);
    hours += numField(line, hs, he);
  }
  return { employees, hours };
}

function latestMetalNonmetalZip(html: string) {
  const matches = [...html.matchAll(/href=["']([^"']*made(\d{4})_(\d+)\.zip)["']/gi)];
  if (!matches.length) throw new Error("Could not locate latest MSHA Metal/Nonmetal employment file");
  matches.sort((a, b) => Number(b[2]) - Number(a[2]) || Number(b[3]) - Number(a[3]));
  const href = matches[0][1].replace(/&amp;/g, "&");
  const year = Number(matches[0][2]);
  const quarter = Number(matches[0][3]);
  const url = new URL(href, BASE).toString();
  return { url, year, quarter };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const page = await fetch(AETABLE, { headers: { "User-Agent": "SticksAndStoneLandCo/1.0" } });
    if (!page.ok) throw new Error(`MSHA index request failed: ${page.status}`);
    const html = await page.text();
    const latest = latestMetalNonmetalZip(html);

    const zipResp = await fetch(latest.url, { headers: { "User-Agent": "SticksAndStoneLandCo/1.0" } });
    if (!zipResp.ok) throw new Error(`MSHA data request failed: ${zipResp.status}`);
    const bytes = new Uint8Array(await zipResp.arrayBuffer());
    const files = unzipSync(bytes);
    const firstName = Object.keys(files)[0];
    if (!firstName) throw new Error("MSHA zip contained no data file");
    const text = strFromU8(files[firstName]);

    const sites = await base44.asServiceRole.entities.MiningSite.list("-created_date", 500);
    const siteByMineId = new Map(
      (sites || []).filter((s: any) => s.msha_mine_id).map((s: any) => [String(s.msha_mine_id).trim(), s])
    );

    let matched = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const sample: any[] = [];

    for (const rawLine of text.split(/\r?\n/)) {
      if (rawLine.length < 250) continue;
      const mineId = field(rawLine, 1, 7);
      const site: any = siteByMineId.get(mineId);
      if (!site) continue;
      matched++;

      const stateFips = field(rawLine, 22, 23);
      if (stateFips !== "47") {
        skipped++;
        continue;
      }

      const mineName = field(rawLine, 104, 133) || site.mine_name || `MSHA ${mineId}`;
      const companyName = field(rawLine, 56, 85);
      const county = field(rawLine, 227, 250);
      const sic = field(rawLine, 27, 31);
      const totals = quarterTotals(rawLine, latest.quarter);
      const sourceKey = `MSHA-MADE-${latest.year}-Q${latest.quarter}-${mineId}`;
      const directSource = latest.url;

      const record = {
        mining_site_id: site.id,
        msha_mine_id: mineId,
        mine_name: mineName,
        year: latest.year,
        period: `Q${latest.quarter}`,
        commodity: site.commodity || null,
        production_amount: null,
        production_unit: "MNM tonnage not reported in Part 50 employment file",
        employee_hours: totals.hours,
        average_employees: totals.employees,
        source_agency: "MSHA Part 50",
        source_url: directSource,
        source_record_id: sourceKey,
        last_source_update: new Date().toISOString(),
        notes: `Company: ${companyName || "—"}; County: ${county || site.county || "—"}; SIC: ${sic || "—"}. Employee figures are summed across reported mine subunits for the quarter. Metal/Nonmetal production tonnage is intentionally left blank because MSHA Part 50 production tonnage fields are coal-only.`,
      };

      const existing = await base44.asServiceRole.entities.ProductionRecord.filter(
        { source_record_id: sourceKey }, "-updated_date", 1, 0
      );
      if (existing?.[0]) {
        await base44.asServiceRole.entities.ProductionRecord.update(existing[0].id, record);
        updated++;
      } else {
        await base44.asServiceRole.entities.ProductionRecord.create(record);
        created++;
      }

      if (sample.length < 10) sample.push({ mineId, mineName, hours: totals.hours, employees: totals.employees });
    }

    return Response.json({
      success: true,
      source: latest.url,
      year: latest.year,
      quarter: latest.quarter,
      matched,
      created,
      updated,
      skipped,
      sample,
      note: "MNM production tonnage is not populated from Part 50 because those production fields are coal-only.",
    });
  } catch (error: any) {
    console.error("sync-msha-employment error", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
