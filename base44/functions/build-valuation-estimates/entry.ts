import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { calculateComparableQuarryValue } from "../../shared/quarryValuation.js";

const SOUTHEAST_STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const valuationDate = todayISODate();

    // Load all comparable sales (public-read entity) once.
    const comps = await base44.asServiceRole.entities.QuarryComparable.list("-updated_date", 200);

    // Load existing ValuationRecord rows for today so we upsert instead of duplicate.
    const existing = await base44.asServiceRole.entities.ValuationRecord.filter({ valuation_date: valuationDate }, "-updated_date", 1000);
    const existingBySite: Record<string, any> = {};
    for (const row of existing || []) {
      if (row.mining_site_id) existingBySite[row.mining_site_id] = row;
    }

    let computed = 0;
    let stored = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const state of SOUTHEAST_STATES) {
      let hasMore = true;
      let offset = 0;
      while (hasMore) {
        const page = await base44.asServiceRole.entities.MiningSite.filter({ state }, "-updated_date", 500, offset);
        const rows = page || [];
        offset += rows.length;
        hasMore = rows.length === 500;

        for (const site of rows) {
          computed += 1;
          try {
            const valuation = calculateComparableQuarryValue({ site, comps });
            if (!valuation?.available) {
              skipped += 1;
              continue;
            }

            const payload = {
              mining_site_id: site.id,
              msha_mine_id: site.msha_mine_id || null,
              parcel_id: site.parcel_id || null,
              mine_name: site.mine_name,
              state: site.state,
              county: site.county || null,
              valuation_date: valuationDate,
              acreage: valuation.acres,
              value_per_acre: Math.round((valuation.low + valuation.high) / 2 / valuation.acres),
              estimated_market_value: valuation.mid,
              commodity: site.commodity || null,
              rock_type: null,
              valuation_confidence: valuation.confidence,
              valuation_method: "comparable_sales",
              source_summary: valuation.basis.join(" · "),
              source_urls: [],
              notes: `Comp-based revalue. Matched comps: ${valuation.matchedCompCount ?? 0}. ${valuation.disclaimer}`,
            };

            const existingRow = existingBySite[site.id];
            if (existingRow) {
              await base44.asServiceRole.entities.ValuationRecord.update(existingRow.id, payload);
            } else {
              await base44.asServiceRole.entities.ValuationRecord.create(payload);
            }
            stored += 1;
          } catch (error) {
            errors.push({ site_id: site.id, mine_name: site.mine_name, error: error?.message || String(error) });
          }
        }
      }
    }

    try {
      await base44.asServiceRole.entities.OperationsEvent.create({
        event_type: "Report",
        related_entity_id: "build-valuation-estimates",
        status: errors.length ? "Failed" : "Completed",
        summary: `Valuation revalue: ${stored}/${computed} stored, ${skipped} skipped, ${errors.length} errors`,
        occurred_at: new Date().toISOString(),
      });
    } catch (_) {}

    return Response.json({
      success: errors.length === 0,
      valuation_date: valuationDate,
      comps_loaded: comps?.length || 0,
      sites_considered: computed,
      valuations_stored: stored,
      skipped_no_acreage: skipped,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}