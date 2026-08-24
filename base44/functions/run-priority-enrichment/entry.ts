import { createClientFromRequest } from "npm:@base44/sdk";

async function run(base44: any, name: string, args: any = {}) {
  const started = new Date().toISOString();
  try {
    const response = await base44.asServiceRole.functions.invoke(name, args);
    const data = response?.data || response;
    return {
      name,
      success: data?.success !== false && !data?.error,
      started,
      completed: new Date().toISOString(),
      result: data,
    };
  } catch (error: any) {
    return {
      name,
      success: false,
      started,
      completed: new Date().toISOString(),
      error: error?.message || String(error),
    };
  }
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit || 500), 1), 500);

  const results = [];
  results.push(await run(base44, "sync-parcel-boundaries", { limit }));
  results.push(await run(base44, "sync-tn-npdes-environmental", { limit }));
  results.push(await run(base44, "sync-owner-operator-permit-acreage", { limit }));
  results.push(await run(base44, "report-data-freshness", {}));

  for (const item of results) {
    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "run-priority-enrichment",
        status: item.success ? "Completed" : "Failed",
        summary: `${item.name}: ${item.success ? "completed" : item.error || item.result?.error || "failed"}`,
        occurred_at: item.completed || new Date().toISOString(),
      });
    } catch (_) {}
  }

  return Response.json({
    success: results.every((r) => r.success),
    ran_at: new Date().toISOString(),
    results,
  });
}