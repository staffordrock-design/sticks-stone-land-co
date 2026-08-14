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
  const now = new Date();
  const day = now.getUTCDay();
  const date = now.getUTCDate();
  const results: any[] = [];

  // MSHA Mines is the authoritative mine identity/status/operator backbone. Refresh weekly by Mine ID.
  if (day === 6) results.push(await run(base44, "sync-msha-mines", {}));

  // MSHA employment is quarterly; weekly checking catches a newly posted quarter without hammering the source.
  if (day === 6) results.push(await run(base44, "sync-msha-employment", {}));

  // Parcel GIS can change more often, so refresh the Tennessee working set weekly.
  if (day === 0) results.push(await run(base44, "sync-parcel-boundaries", { limit: 500 }));

  // EPA ICIS-NPDES is our dependable automated permit/compliance cross-check for Tennessee mining sites.
  // DMGR remains the controlling Tennessee record source; this job never invents missing DMGR-only fields.
  if (day === 1) results.push(await run(base44, "sync-tn-npdes-environmental", { limit: 500 }));

  // Bedrock geology is comparatively stable; refresh once a month.
  if (date === 1) results.push(await run(base44, "sync-tn-geology", {}));

  // Always recalculate report freshness after the scheduled maintenance window.
  results.push(await run(base44, "report-data-freshness", {}));

  for (const item of results) {
    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "scheduled-report-data-refresh",
        status: item.success ? "Completed" : "Failed",
        summary: `${item.name}: ${item.success ? "completed" : item.error || "failed"}`,
        occurred_at: item.completed || new Date().toISOString(),
      });
      if (!item.success) {
        await base44.asServiceRole.entities.OperationalError.create({
          area: "Data",
          operation: item.name,
          error_message: item.error || item.result?.error || "Scheduled refresh failed",
          severity: "Error",
          status: "Open",
          occurred_at: item.completed || new Date().toISOString(),
        });
      }
    } catch (_) {}
  }

  return Response.json({ success: results.every((r) => r.success), ran_at: new Date().toISOString(), results });
}
