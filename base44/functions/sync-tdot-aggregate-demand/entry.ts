import { createClientFromRequest } from "npm:@base44/sdk";
import pdfParseImport from "npm:pdf-parse@1.1.1";

const TN_BASE = "https://www.tn.gov";
const USER_AGENT = "SSRockHoldings/1.0 (+TDOT aggregate demand research)";

function absoluteUrl(href: string, base: string) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function canonicalCounty(name: string) {
  const key = clean(name).toUpperCase();
  const special: Record<string, string> = {
    "DEKALB": "DeKalb",
    "MCMINN": "McMinn",
    "MCNAIRY": "McNairy",
  };
  if (special[key]) return special[key];
  return key.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

function materialGroup(description: string) {
  const u = description.toUpperCase();
  if (/MACHINED RIP[- ]RAP|\bRIP[- ]RAP\b/.test(u)) return "Rip-Rap";
  if (u.includes("GRADED SOLID ROCK")) return "Graded Solid Rock";
  if (u.includes("MINERAL AGGREGATE")) {
    if (u.includes("SIZE 57")) return "#57 Aggregate";
    if (u.includes("BASE")) return "Aggregate Base";
    return "Mineral Aggregate";
  }
  if (u.includes("AGGREGATE FOR COVER MATERIAL")) return "Cover Aggregate";
  if (u.includes("GRANULAR BACKFILL")) return "Granular Backfill";
  if (u.includes("AGGREGATE-CEMENT BASE") || u.includes("AGGREGATE CEMENT BASE")) return "Aggregate-Cement Base";
  if (u.includes("CRUSHED STONE") && !u.includes("ASPHALT")) return "Crushed Stone";
  return null;
}

function isoLettingDate(text: string) {
  const m = text.match(/Estimated Quantities\s*--\s*Letting\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (!m) return null;
  const d = new Date(`${m[1]} 12:00:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parsePdfText(text: string, sourceUrl: string) {
  const lettingDate = isoLettingDate(text) || new Date().toISOString().slice(0, 10);
  const sections = text.split(/(?=Contract ID\s+CN\d+\s*-)/gi);
  const output: any[] = [];

  for (const section of sections) {
    const contractMatch = section.match(/Contract ID\s+(CN\d+)/i);
    if (!contractMatch) continue;
    const contractId = contractMatch[1].toUpperCase();
    const lines = section.split(/\r?\n/).map(clean).filter(Boolean);

    const countyMatch = section.match(/Counties:\s*([\s\S]*?)(?:\n\s*District:|\n\s*Contract Time:|\n\s*Description:)/i);
    const counties = countyMatch
      ? countyMatch[1]
          .replace(/\bETC\.?\b/gi, "")
          .split(",")
          .map(canonicalCounty)
          .filter(Boolean)
      : [];

    let projectId = "";
    for (const line of lines.slice(0, 45)) {
      const m = line.match(/^([0-9A-Z]{5,}(?:-[A-Z0-9]+){1,4})(?:\s|$)/);
      if (m && !line.startsWith("Contract") && !line.startsWith("Item")) { projectId = m[1]; break; }
    }

    for (let i = 0; i < lines.length; i++) {
      if (!/^\d{3}-\d/.test(lines[i])) continue;
      let combined = lines[i];
      let j = i + 1;
      while (!/\b[0-9][0-9,]*\.\d+\s+TON\b/i.test(combined) && j < lines.length && !/^\d{3}-\d/.test(lines[j]) && j <= i + 6) {
        combined += ` ${lines[j]}`;
        j++;
      }
      const m = combined.match(/^(\d{3}-\d{2}(?:\.\d{1,2})?)\s+(.+?)\s+([0-9][0-9,]*\.\d+)\s+TON\b/i);
      if (!m) continue;
      const [, itemNo, descriptionRaw, quantityRaw] = m;
      const description = clean(descriptionRaw);
      const group = materialGroup(description);
      if (!group) continue;
      const quantity = Number(quantityRaw.replace(/,/g, ""));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      output.push({
        letting_date: lettingDate,
        contract_id: contractId,
        project_id: projectId || undefined,
        county: counties.length === 1 ? counties[0] : undefined,
        counties,
        item_no: itemNo,
        description,
        quantity,
        unit: "TON",
        material_group: group,
        source_title: `TDOT Estimated Quantities - ${lettingDate} Letting`,
        source_url: sourceUrl,
        last_source_update: new Date().toISOString(),
      });
      i = Math.max(i, j - 1);
    }
  }

  const seen = new Set<string>();
  return output.filter((r) => {
    const key = [r.letting_date, r.contract_id, r.item_no, r.quantity].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

async function fetchPdfRows(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdfParse: any = (pdfParseImport as any)?.default || pdfParseImport;
  const parsed = await pdfParse(bytes);
  return parsePdfText(parsed?.text || "", url);
}

function quantityPdfFromLettingPage(html: string, pageUrl: string) {
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const m of anchors) {
    const label = stripHtml(m[2]);
    if (/quantities/i.test(label) && /\.pdf(?:$|\?)/i.test(m[1])) return absoluteUrl(m[1].replace(/&amp;/g, "&"), pageUrl);
  }
  return null;
}

function lettingPagesFromIndex(html: string, indexUrl: string, year: number) {
  const urls = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    const label = stripHtml(m[2]);
    if (!new RegExp(`${year}.*letting`, "i").test(label) && !href.includes(`/${year}-bid-lettings/`)) continue;
    if (!/letting\.html(?:$|\?)/i.test(href)) continue;
    urls.add(absoluteUrl(href, indexUrl));
  }
  return [...urls];
}

function rowKey(r: any) {
  return [r.letting_date, r.contract_id, r.item_no, String(r.quantity)].join("|");
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year || new Date().getUTCFullYear());
    const indexUrl = `${TN_BASE}/tdot/tdot-construction-division/bid-lettings/${year}-bid-lettings.html`;
    const indexHtml = await fetchText(indexUrl);
    const lettingPages = lettingPagesFromIndex(indexHtml, indexUrl, year);
    const allRows: any[] = [];
    const sources: any[] = [];

    for (const pageUrl of lettingPages) {
      try {
        const pageHtml = await fetchText(pageUrl);
        const pdfUrl = quantityPdfFromLettingPage(pageHtml, pageUrl);
        if (!pdfUrl) { sources.push({ pageUrl, status: "no-quantities-pdf" }); continue; }
        const rows = await fetchPdfRows(pdfUrl);
        allRows.push(...rows);
        sources.push({ pageUrl, pdfUrl, status: "ok", rows: rows.length });
      } catch (error: any) {
        sources.push({ pageUrl, status: "error", error: error?.message || String(error) });
      }
    }

    const dedup = new Map<string, any>();
    for (const row of allRows) dedup.set(rowKey(row), row);
    const rows = [...dedup.values()];

    const existing: any[] = [];
    for (let skip = 0; skip < 5000; skip += 500) {
      const page = await base44.asServiceRole.entities.TDOTAggregateDemand.filter({}, "-updated_date", 500, skip).catch(() => []);
      existing.push(...(page || []));
      if (!page || page.length < 500) break;
    }
    const byKey = new Map(existing.map((r) => [rowKey(r), r]));

    let created = 0, updated = 0, failed = 0;
    for (let i = 0; i < rows.length; i += 20) {
      const results = await Promise.allSettled(rows.slice(i, i + 20).map(async (row) => {
        const prev: any = byKey.get(rowKey(row));
        if (prev?.id) { await base44.asServiceRole.entities.TDOTAggregateDemand.update(prev.id, row); return "updated"; }
        const made = await base44.asServiceRole.entities.TDOTAggregateDemand.create(row);
        if (made) byKey.set(rowKey(row), made);
        return "created";
      }));
      for (const result of results) {
        if (result.status === "fulfilled" && result.value === "created") created++;
        else if (result.status === "fulfilled" && result.value === "updated") updated++;
        else failed++;
      }
    }

    const totalTons = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
    const now = new Date().toISOString();
    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "sync-tdot-aggregate-demand",
        status: failed ? "Completed with errors" : "Completed",
        summary: `TDOT ${year} aggregate demand: ${rows.length} line items, ${Math.round(totalTons).toLocaleString()} tons; ${created} created, ${updated} updated, ${failed} failed.`,
        occurred_at: now,
      });
    } catch (_) {}

    return Response.json({ success: failed === 0, year, lettingPages: lettingPages.length, rows: rows.length, totalTons, created, updated, failed, sources, ran_at: now });
  } catch (error: any) {
    console.error("sync-tdot-aggregate-demand error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
