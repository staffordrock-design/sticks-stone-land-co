import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

// Computes the public inventory counters ONCE across the complete inventory and
// stores the result, so the homepage counters stop drifting between loads.
// (Previously the count read only the 10,000 most-recently-updated rows of a
// 22,000+ record table, so a data sync reshuffled which rows were counted.)
const PAGE = 1000;

function isQuarryRelevant(site: any) {
  const commodity = String(site?.commodity || "").toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes("coal")) return false;
  return ["stone", "limestone", "sand", "gravel", "aggregate", "marble", "granite", "slate", "shale", "quartz", "clay", "dolomite", "rock", "lime"].some((term) => commodity.includes(term));
}

function hasValue(v: any) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const svc = base44.asServiceRole;

    let recordCount = 0;
    let mappedCount = 0;
    let parcelLinkedCount = 0;
    let enrichedCount = 0;
    let latestRefresh: string | null = null;
    let scanned = 0;
    const stateSet = new Set<string>();

    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const page = await svc.entities.MiningSite.filter({}, "-created_date", PAGE, offset).catch(() => []);
      const rows = page || [];
      offset += rows.length;
      hasMore = rows.length === PAGE;
      scanned += rows.length;

      for (const raw of rows) {
        const d = raw.updated_date || raw.last_source_update || raw.created_date;
        if (d && (!latestRefresh || d > latestRefresh)) latestRefresh = d;
        if (!isQuarryRelevant(raw)) continue;
        recordCount += 1;
        if (hasValue(raw.latitude) && hasValue(raw.longitude) && Number(raw.latitude) !== 0 && Number(raw.longitude) !== 0) mappedCount += 1;
        if (hasValue(raw.parcel_id)) parcelLinkedCount += 1;
        if (hasValue(raw.parcel_id) || hasValue(raw.tdec_permit_number) || hasValue(raw.npdes_permit_number) || hasValue(raw.operator_name)) enrichedCount += 1;
        const st = String(raw.state || "").trim().toUpperCase();
        if (st) stateSet.add(st);
      }
    }

    let deedLinkedCount = 0;
    try {
      const parcelRecords = await svc.entities.ParcelRecord.filter({}, "-updated_date", 5000).catch(() => []);
      deedLinkedCount = (parcelRecords || []).filter((p: any) => hasValue(p.deed_book_page)).length;
    } catch { /* ignore */ }

    const payload = {
      recordCount,
      mappedCount,
      parcelLinkedCount,
      deedLinkedCount,
      enrichedCount,
      statesCovered: Array.from(stateSet).sort(),
      latestRefresh,
      sources: [
        "MSHA",
        "State mining & environmental agencies",
        "County GIS / parcel records",
        "Deeds / ownership records",
        "USGS",
        "Geology datasets",
        "TDOT / transportation demand data",
      ],
      computed_at: new Date().toISOString(),
    };

    const existing = await svc.entities.PublicInventoryStats.list("-created_date", 1).catch(() => []);
    const row = (existing || [])[0];
    if (row?.id) {
      await svc.entities.PublicInventoryStats.update(row.id, payload);
    } else {
      await svc.entities.PublicInventoryStats.create(payload);
    }

    return Response.json({ ok: true, scanned, stored: payload });
  } catch (error: any) {
    console.error("compute-public-inventory-stats error:", error?.message || error);
    return Response.json({ error: error?.message || "Failed to compute inventory stats" }, { status: 500 });
  }
}