import { createClientFromRequest } from "npm:@base44/sdk";
import * as XLSX from "npm:xlsx";

const USGS_PAGE = "https://www.usgs.gov/centers/national-minerals-information-center/crushed-stone-statistics-and-information";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = clean(value).replace(/,/g, "");
  if (!text || /^W$/i.test(text) || /^\(?\d+\)?$/.test(text) && /^\(.*\)$/.test(text)) return null;
  const n = Number(text.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function workbookLinks(html: string, limit = 8) {
  const matches = [...html.matchAll(/href=["']([^"']*mis-(\d{4})q([1-4])-conagg\.xlsx[^"']*)["']/gi)];
  if (!matches.length) throw new Error("Could not locate any USGS quarterly aggregates XLSX link");
  // Deduplicate by year+quarter, then sort newest first, cap to limit.
  const seen = new Set<string>();
  const links = matches
    .map((m) => ({ url: new URL(m[1].replace(/&amp;/g, "&"), USGS_PAGE).toString(), year: Number(m[2]), quarter: Number(m[3]) }))
    .filter((l) => {
      const key = `${l.year}-${l.quarter}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
    .slice(0, limit);
  return links;
}

function classifySheet(rows: any[][]) {
  const text = rows.slice(0, 14).flat().map(clean).join(" ").toLowerCase();
  if (text.includes("construction aggregates sold or used") && text.includes("by state")) return "Construction Aggregates";
  if (text.includes("construction sand and gravel sold or used") && text.includes("by state")) return "Construction Sand and Gravel";
  if (text.includes("crushed stone sold or used") && text.includes("by state")) return "Crushed Stone";
  return null;
}

function parseStateRow(row: any[]) {
  const values = row.slice(1).map(numeric);
  const populated = values.filter((v) => v != null) as number[];
  if (populated.length < 2) return null;
  // USGS Table 2/4/6 order: current-quarter quantity, % change, prior-year Q1-Q4, annual quantity, annual value.
  const currentQtyThousand = values[0];
  const percentChange = values[1];
  const annualQtyThousand = values[6];
  const annualValueThousand = values[7];
  if (currentQtyThousand == null) return null;
  return {
    quantity_metric_tons: currentQtyThousand * 1000,
    percent_change_yoy: percentChange,
    prior_year_annual_quantity_metric_tons: annualQtyThousand == null ? null : annualQtyThousand * 1000,
    prior_year_annual_value_usd: annualValueThousand == null ? null : annualValueThousand * 1000,
  };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const page = await fetch(USGS_PAGE, { headers: { "User-Agent": "SSRockHoldings/1.0" } });
    if (!page.ok) throw new Error(`USGS publications page request failed: ${page.status}`);
    const links = workbookLinks(await page.text());
    if (!links.length) throw new Error("No USGS quarterly aggregates workbooks found");

    const SOUTHEAST_STATES: { code: string; name: string }[] = [
      { code: "TN", name: "Tennessee" },
      { code: "GA", name: "Georgia" },
      { code: "AL", name: "Alabama" },
      { code: "KY", name: "Kentucky" },
      { code: "NC", name: "North Carolina" },
      { code: "SC", name: "South Carolina" },
      { code: "FL", name: "Florida" },
      { code: "MS", name: "Mississippi" },
    ];
    const now = new Date().toISOString();
    const found: any[] = [];
    const periodsCovered: string[] = [];

    for (const link of links) {
      try {
        const workbookResponse = await fetch(link.url, { headers: { "User-Agent": "SSRockHoldings/1.0" } });
        if (!workbookResponse.ok) continue;
        const workbook = XLSX.read(new Uint8Array(await workbookResponse.arrayBuffer()), { type: "array" });
        const period = `Q${link.quarter}`;

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as any[][];
          const group = classifySheet(rows);
          if (!group) continue;
          for (const { code, name } of SOUTHEAST_STATES) {
            const stateRow = rows.find((row) => clean(row?.[0]).toLowerCase() === name.toLowerCase());
            if (!stateRow) continue;
            const parsed = parseStateRow(stateRow);
            if (!parsed) continue;
            const record = {
              state: code,
              commodity_group: group,
              year: link.year,
              period,
              quantity_metric_tons: parsed.quantity_metric_tons,
              percent_change_yoy: parsed.percent_change_yoy ?? undefined,
              prior_year_annual_quantity_metric_tons: parsed.prior_year_annual_quantity_metric_tons ?? undefined,
              prior_year_annual_value_usd: parsed.prior_year_annual_value_usd ?? undefined,
              source_title: `USGS Crushed Stone and Sand and Gravel in ${period} ${link.year}`,
              source_url: link.url,
              publication_date: now.slice(0, 10),
              methodology_note: "USGS state production-for-consumption estimate from its quarterly sample survey of construction aggregate producers. State totals are estimates and are not individual-quarry reported tonnage.",
              last_source_update: now,
            };
            const existing = await base44.asServiceRole.entities.USGSMarketProduction.filter({
              state: code,
              commodity_group: group,
              year: link.year,
              period,
            }, "-updated_date", 1, 0);
            if (existing?.[0]) await base44.asServiceRole.entities.USGSMarketProduction.update(existing[0].id, record);
            else await base44.asServiceRole.entities.USGSMarketProduction.create(record);
            found.push(record);
          }
        }
        periodsCovered.push(`${link.year} ${period}`);
      } catch (err) {
        console.error(`USGS workbook ${link.year} Q${link.quarter} failed`, err);
      }
    }

    if (!found.length) throw new Error("USGS workbooks loaded, but no Southeast state production rows were found");

    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "sync-usgs-aggregate-production",
        status: "Completed",
        summary: `USGS aggregate production backfill: ${found.length} Southeast market rows refreshed across ${periodsCovered.length} quarterly publications (${periodsCovered.join(", ")}).`,
        occurred_at: now,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      periodsCovered,
      statesCovered: [...new Set(found.map((r) => r.state))],
      recordCount: found.length,
      note: "USGS values are statewide production-for-consumption estimates. Individual mine tonnage is not published in this layer.",
    });
  } catch (error: any) {
    console.error("sync-usgs-aggregate-production error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}