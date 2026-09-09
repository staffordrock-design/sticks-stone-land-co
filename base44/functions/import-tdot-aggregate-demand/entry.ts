import { createClientFromRequest } from "npm:@base44/sdk";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(clean(value).replace(/,/g, "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function materialGroup(description: string) {
  const s = description.toUpperCase();
  if (s.includes("MINERAL AGGREGATE") && s.includes("SIZE 57")) return "#57 Aggregate";
  if (s.includes("MINERAL AGGREGATE") && s.includes("BASE")) return "Aggregate Base";
  if (s.includes("RIP-RAP") || s.includes("RIP RAP")) return "Rip-Rap";
  if (s.includes("BORROW EXCAVATION") && s.includes("ROCK")) return "Graded Solid Rock";
  if (s.includes("AGGREGATE FOR COVER")) return "Cover Aggregate";
  if (s.includes("GRANULAR BACKFILL")) return "Granular Backfill";
  return "Aggregate / Stone";
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
    const output: any[] = [];
    for (const input of records) {
      const contractId = clean(input?.contract_id);
      const description = clean(input?.description);
      const quantity = num(input?.quantity);
      const unit = clean(input?.unit).toUpperCase();
      const sourceUrl = clean(input?.source_url);
      if (!contractId || !description || !quantity || quantity <= 0 || !unit || !sourceUrl) {
        output.push({ success: false, input, error: "contract_id, description, positive quantity, unit, and source_url are required" });
        continue;
      }
      const row = {
        letting_date: clean(input?.letting_date),
        contract_id: contractId,
        project_id: clean(input?.project_id),
        county: clean(input?.county),
        counties: Array.isArray(input?.counties) ? input.counties.map(clean).filter(Boolean) : undefined,
        item_no: clean(input?.item_no),
        description,
        quantity,
        unit,
        material_group: clean(input?.material_group) || materialGroup(description),
        source_title: clean(input?.source_title) || `TDOT Estimated Quantities - ${contractId}`,
        source_url: sourceUrl,
        last_source_update: clean(input?.last_source_update) || now,
      };
      const identity: any = { contract_id: contractId, item_no: row.item_no, description };
      const existing = await base44.asServiceRole.entities.TDOTAggregateDemand.filter(identity, "-updated_date", 1, 0);
      if (existing?.[0]) {
        await base44.asServiceRole.entities.TDOTAggregateDemand.update(existing[0].id, row);
        output.push({ success: true, action: "updated", id: existing[0].id, contract_id: contractId, quantity, unit });
      } else {
        const created = await base44.asServiceRole.entities.TDOTAggregateDemand.create(row);
        output.push({ success: true, action: "created", id: created?.id, contract_id: contractId, quantity, unit });
      }
    }

    return Response.json({ success: output.every((r) => r.success), imported: output.filter((r) => r.success).length, results: output });
  } catch (error: any) {
    console.error("import-tdot-aggregate-demand error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
