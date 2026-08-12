import { createClientFromRequest } from "npm:@base44/sdk";

const DAY = 24 * 60 * 60 * 1000;

function newestDate(rows: any[], fields: string[]) {
  let newest = 0;
  for (const row of rows || []) {
    for (const field of fields) {
      const raw = row?.[field];
      if (!raw) continue;
      const t = new Date(raw).getTime();
      if (Number.isFinite(t) && t > newest) newest = t;
    }
  }
  return newest ? new Date(newest) : null;
}

function stateFor(date: Date | null, currentDays: number, staleDays: number) {
  if (!date) return "Due";
  const age = Date.now() - date.getTime();
  if (age <= currentDays * DAY) return "Current";
  if (age <= staleDays * DAY) return "Due";
  return "Stale";
}

async function upsert(base44: any, source: string, payload: any) {
  const rows = await base44.asServiceRole.entities.DataFreshnessStatus.filter({ source }, "-updated_date", 1, 0);
  if (rows?.[0]) return base44.asServiceRole.entities.DataFreshnessStatus.update(rows[0].id, payload);
  return base44.asServiceRole.entities.DataFreshnessStatus.create({ source, ...payload });
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();

    const [sites, permits, geology, parcels, environmental, production] = await Promise.all([
      base44.asServiceRole.entities.MiningSite.list("-updated_date", 500),
      base44.asServiceRole.entities.TDECPermit.list("-updated_date", 500),
      base44.asServiceRole.entities.GeologyRecord.list("-updated_date", 500),
      base44.asServiceRole.entities.ParcelRecord.list("-updated_date", 500),
      base44.asServiceRole.entities.EnvironmentalRecord.list("-updated_date", 500),
      base44.asServiceRole.entities.ProductionRecord.list("-updated_date", 500),
    ]);

    const definitions = [
      { source: "MSHA", rows: [...(sites || []), ...(production || [])], fields: ["last_source_update", "updated_date"], current: 100, stale: 190 },
      { source: "TDEC", rows: permits || [], fields: ["last_source_update", "updated_date"], current: 30, stale: 90 },
      { source: "Geology", rows: geology || [], fields: ["last_source_update", "updated_date"], current: 120, stale: 240 },
      { source: "Parcel", rows: parcels || [], fields: ["last_source_update", "boundary_last_verified", "updated_date"], current: 30, stale: 90 },
      { source: "Tax", rows: parcels || [], fields: ["last_source_update", "updated_date"], current: 60, stale: 180 },
      { source: "Environmental", rows: environmental || [], fields: ["last_source_update", "updated_date"], current: 30, stale: 90 },
    ];

    const results: any[] = [];
    for (const def of definitions) {
      const newest = newestDate(def.rows, def.fields);
      const status = stateFor(newest, def.current, def.stale);
      const payload = {
        last_sync_at: newest ? newest.toISOString() : null,
        latest_source_period: newest ? newest.toISOString().slice(0, 10) : null,
        status,
        records_updated: def.rows.length,
        error_message: null,
      };
      await upsert(base44, def.source, payload);
      results.push({ source: def.source, status, newest: payload.last_sync_at, records: def.rows.length });
    }

    await base44.asServiceRole.entities.BusinessHealthCheck.create({
      area: "Data",
      status: results.some((r) => r.status === "Stale") ? "Red" : results.some((r) => r.status === "Due") ? "Yellow" : "Green",
      summary: results.map((r) => `${r.source}:${r.status}`).join(" · "),
      checked_at: now,
    });

    return Response.json({ success: true, checked_at: now, results });
  } catch (error: any) {
    console.error("report-data-freshness error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
