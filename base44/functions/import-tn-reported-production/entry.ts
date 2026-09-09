import { createClientFromRequest } from "npm:@base44/sdk";

const AGENCY = "Tennessee Department of Labor & Workforce Development - Mine Safety Unit";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(clean(value).replace(/,/g, "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const records = Array.isArray(body?.records) ? body.records : [];
    if (!records.length) return Response.json({ error: "records array is required" }, { status: 400 });

    const now = new Date().toISOString();
    const results: any[] = [];

    for (const input of records) {
      const year = Number(input?.year);
      const tons = numberValue(input?.tonnage ?? input?.production_amount);
      const mshaMineId = clean(input?.msha_mine_id);
      const mineNameInput = clean(input?.mine_name);
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getUTCFullYear() + 1 || !tons || tons <= 0 || (!mshaMineId && !mineNameInput)) {
        results.push({ success: false, input, error: "year, positive tonnage, and mine identifier/name are required" });
        continue;
      }

      let site: any = null;
      if (mshaMineId) {
        const rows = await base44.asServiceRole.entities.MiningSite.filter({ msha_mine_id: mshaMineId }, "-updated_date", 5, 0);
        site = rows?.[0] || null;
      }
      if (!site && mineNameInput) {
        const query: any = { mine_name: mineNameInput, state: "TN" };
        if (input?.county) query.county = clean(input.county);
        const rows = await base44.asServiceRole.entities.MiningSite.filter(query, "-updated_date", 5, 0);
        site = rows?.[0] || null;
      }

      const mineName = site?.mine_name || mineNameInput || `MSHA ${mshaMineId}`;
      const sourceRecordId = clean(input?.source_record_id) || `TN-MINESAFETY-${year}-${site?.msha_mine_id || mshaMineId || mineName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const row = {
        mining_site_id: site?.id || "",
        msha_mine_id: site?.msha_mine_id || mshaMineId,
        mine_name: mineName,
        year,
        period: clean(input?.period) || "Annual",
        commodity: clean(input?.commodity || site?.commodity),
        production_amount: tons,
        production_unit: clean(input?.production_unit) || "tons",
        employee_hours: numberValue(input?.employee_hours) ?? undefined,
        average_employees: numberValue(input?.average_employees) ?? undefined,
        source_agency: AGENCY,
        source_url: clean(input?.source_url),
        source_record_id: sourceRecordId,
        last_source_update: clean(input?.last_source_update) || now,
        notes: clean(input?.notes) || "Annual mine statistical report. Stored as reported production; not an S&S estimate.",
        record_type: "Reported Production",
        is_estimate: false,
        confidence: "High",
        methodology: "TN-MINESAFETY-ANNUAL-REPORTED",
      };

      const existing = await base44.asServiceRole.entities.ProductionRecord.filter({ source_record_id: sourceRecordId }, "-updated_date", 1, 0);
      if (existing?.[0]) {
        await base44.asServiceRole.entities.ProductionRecord.update(existing[0].id, row);
        results.push({ success: true, action: "updated", id: existing[0].id, source_record_id: sourceRecordId, mine_name: mineName, year, tons });
      } else {
        const created = await base44.asServiceRole.entities.ProductionRecord.create(row);
        results.push({ success: true, action: "created", id: created?.id, source_record_id: sourceRecordId, mine_name: mineName, year, tons });
      }
    }

    const successful = results.filter((r) => r.success);
    return Response.json({
      success: successful.length === results.length,
      imported: successful.length,
      failed: results.length - successful.length,
      source_agency: AGENCY,
      results,
    });
  } catch (error: any) {
    console.error("import-tn-reported-production error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
