import { createClientFromRequest } from "npm:@base44/sdk";

async function run(base44: any, name: string, args: any = {}) {
  const started = new Date().toISOString();
  try {
    const response = await base44.asServiceRole.functions.invoke(name, args);
    const data = response?.data || response;
    return { name, success: data?.success !== false && !data?.error, started, completed: new Date().toISOString(), result: data };
  } catch (error: any) {
    return { name, success: false, started, completed: new Date().toISOString(), error: error?.message || String(error) };
  }
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const results: any[] = [];
  results.push(await run(base44, "sync-msha-employment", {}));
  results.push(await run(base44, "sync-usgs-aggregate-production", {}));
  results.push(await run(base44, "build-production-estimates", { state: "TN" }));

  const success = results.every((r) => r.success);
  const now = new Date().toISOString();
  const summary = results.map((r) => `${r.name}:${r.success ? "ok" : r.error || r.result?.error || "failed"}`).join(" · ");

  try {
    const triggerId = body?.event?.entity_id || body?.entity_id || body?.id || null;
    if (triggerId) {
      await base44.asServiceRole.entities.ProductionRefreshTrigger.update(triggerId, {
        status: success ? "Completed" : "Failed",
        completed_at: now,
        result_summary: summary,
      });
    }
  } catch (_) {}

  try {
    await base44.asServiceRole.entities.OperationsEvent.create({
      event_type: "Report",
      related_entity_id: "run-production-refresh",
      status: success ? "Completed" : "Failed",
      summary: `Production intelligence refresh: ${summary}`,
      occurred_at: now,
    });
  } catch (_) {}

  return Response.json({ success, ran_at: now, results });
}