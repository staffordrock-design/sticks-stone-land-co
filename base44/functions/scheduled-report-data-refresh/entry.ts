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
  const now = new Date();
  const day = now.getUTCDay();
  const date = now.getUTCDate();
  const results: any[] = [];

  // MSHA Mines is the authoritative mine identity/status/operator backbone. Refresh all Southeast states weekly by Mine ID.
  if (day === 6) results.push(await run(base44, "sync-msha-mines", {}));

  // Keep the core launch states' USGS MRDS mineral-occurrence coverage moving every week.
  // One state per day avoids a heavy all-state WFS/import burst and reduces rate-limit risk.
  const mrdsStateByDay: Record<number, string> = { 2: "TN", 3: "GA", 4: "NC", 5: "SC" };
  const mrdsState = mrdsStateByDay[day];
  if (mrdsState) results.push(await run(base44, "sync-usgs-mrds-southeast", { state: mrdsState }));

  // Production intelligence: refresh official MSHA mine-level activity, USGS state aggregate totals,
  // then rebuild S&S modeled mine-level ranges from the same quarter.
  if (day === 6) {
    results.push(await run(base44, "sync-msha-employment", {}));
    results.push(await run(base44, "sync-usgs-aggregate-production", {}));
    results.push(await run(base44, "build-production-estimates", { state: "TN" }));
    // Recompute comp-based valuations for every site after the weekly source
    // sync so stored ValuationRecord rows stay current for reports/admin.
    results.push(await run(base44, "build-valuation-estimates", {}));
  }

  // Parcel GIS can change more often. Tennessee and North Carolina both have automated parcel refreshes.
  if (day === 0) {
    results.push(await run(base44, "sync-parcel-boundaries", { limit: 500 }));
    results.push(await run(base44, "sync-nc-parcels", { limit: 200 }));
  }

  // EPA ICIS-NPDES is our dependable automated environmental/compliance cross-check.
  // State mining agencies remain the controlling source for the mining permit itself.
  if (day === 1) results.push(await run(base44, "sync-tn-npdes-environmental", { limit: 500 }));
  const environmentalStateByDay: Record<number, string> = { 2: "GA", 3: "NC", 4: "SC" };
  const environmentalState = environmentalStateByDay[day];
  if (environmentalState) results.push(await run(base44, "sync-southeast-npdes-environmental", { state: environmentalState, limit: 300 }));

  // State mining-permit registries that can be consumed directly without changing the mobile bundle.
  if (day === 3) results.push(await run(base44, "sync-nc-mining-permits", {}));
  if (day === 4) results.push(await run(base44, "sync-sc-mining-permits", {}));
  if (day === 5) results.push(await run(base44, "sync-ga-surface-mining-permits", {}));

  // Bedrock geology is comparatively stable; stagger the monthly refresh by state.
  if (date === 1) results.push(await run(base44, "sync-tn-geology", {}));
  if (date === 2) results.push(await run(base44, "sync-usgs-sgmc-geology", { state: "GA", limit: 200 }));
  if (date === 3) results.push(await run(base44, "sync-usgs-sgmc-geology", { state: "NC", limit: 200 }));
  if (date === 4) results.push(await run(base44, "sync-usgs-sgmc-geology", { state: "SC", limit: 200 }));

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