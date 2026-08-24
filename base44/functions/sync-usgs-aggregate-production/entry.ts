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

function latestWorkbookUrl(html: string) {
  const matches = [...html.matchAll(/href=["']([^"']*mis-(\d{4})q([1-4])-conagg\.xlsx[^"']*)["']/gi)];
  if (!matches.length) throw new Error("Could not locate a USGS quarterly aggregates XLSX link");
  matches.sort((a, b) => Number(b[2]) - Number(a[2]) || Number(b[3]) - Number(a[3]));
  return {
    url: new URL(matches[0][1].replace(/&amp;/g, "&"), USGS_PAGE).toString(),
    year: Number(matches[0][2]),
    quarter: Number(matches[0][3]),
  };
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
    const latest = latestWorkbookUrl(await page.text());

    const workbookResponse = await fetch(latest.url, { headers: { "User-Agent": "SSRockHoldings/1.0" } });
    if (!workbookResponse.ok) throw new Error(`USGS aggregates workbook request failed: ${workbookResponse.status}`);
    const workbook = XLSX.read(new Uint8Array(await workbookResponse.arrayBuffer()), { type: "array" });

    const state = "TN";
    const stateName = "Tennessee";
    const now = new Date().toISOString();
    const period = `Q${latest.quarter}`;
    const found: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as any[][];
      const group = classifySheet(rows);
      if (!group) continue;
      const stateRow = rows.find((row) => clean(row?.[0]).toLowerCase() === stateName.toLowerCase());
      if (!stateRow) continue;
      const parsed = parseStateRow(stateRow);
      if (!parsed) continue;
      const record = {
        state,
        commodity_group: group,
        year: latest.year,
        period,
        quantity_metric_tons: parsed.quantity_metric_tons,
        percent_change_yoy: parsed.percent_change_yoy ?? undefined,
        prior_year_annual_quantity_metric_tons: parsed.prior_year_annual_quantity_metric_tons ?? undefined,
        prior_year_annual_value_usd: parsed.prior_year_annual_value_usd ?? undefined,
        source_title: `USGS Crushed Stone and Sand and Gravel in ${period} ${latest.year}`,
        source_url: latest.url,
        publication_date: now.slice(0, 10),
        methodology_note: "USGS state production-for-consumption estimate from its quarterly sample survey of construction aggregate producers. State totals are estimates and are not individual-quarry reported tonnage.",
        last_source_update: now,
      };
      const existing = await base44.asServiceRole.entities.USGSMarketProduction.filter({
        state,
        commodity_group: group,
        year: latest.year,
        period,
      }, "-updated_date", 1, 0);
      if (existing?.[0]) await base44.asServiceRole.entities.USGSMarketProduction.update(existing[0].id, record);
      else await base44.asServiceRole.entities.USGSMarketProduction.create(record);
      found.push(record);
    }

    if (!found.length) throw new Error("USGS workbook loaded, but Tennessee state production rows were not found");

    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "sync-usgs-aggregate-production",
        status: "Completed",
        summary: `USGS aggregate production ${latest.year} ${period}: ${found.length} Tennessee market rows refreshed.`,
        occurred_at: now,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      source: latest.url,
      year: latest.year,
      quarter: latest.quarter,
      state,
      records: found.map((r) => ({ commodity_group: r.commodity_group, quantity_metric_tons: r.quantity_metric_tons, percent_change_yoy: r.percent_change_yoy })),
      note: "USGS values are statewide production-for-consumption estimates. Individual mine tonnage is not published in this layer.",
    });
  } catch (error: any) {
    console.error("sync-usgs-aggregate-production error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}