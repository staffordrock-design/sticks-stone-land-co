import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { computeReserveLife } from "../../shared/reserveLife.js";

const SOUTHEAST_STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const PAGE = 500;

async function loadAll(entity, query = {}) {
  const rows = [];
  let cursor;
  for (let page = 0; page < 60; page += 1) {
    const result = await entity.filter(query, { limit: PAGE, ...(cursor ? { cursor } : {}) });
    const items = result?.items || (Array.isArray(result) ? result : []);
    rows.push(...items);
    cursor = result?.next_cursor;
    if (!cursor || !items.length) break;
  }
  return rows;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const states = body?.state ? [String(body.state).toUpperCase()] : SOUTHEAST_STATES;

    // Latest modeled annual tonnage per site.
    const estimates = await loadAll(base44.asServiceRole.entities.ProductionRecord, { is_estimate: true });
    const tonsBySite: Record<string, { tons: number; year: number }> = {};
    for (const row of estimates) {
      const siteId = row.mining_site_id;
      const tons = Number(row.production_amount);
      if (!siteId || !Number.isFinite(tons) || tons <= 0) continue;
      const year = Number(row.year) || 0;
      if (!tonsBySite[siteId] || year >= tonsBySite[siteId].year) {
        tonsBySite[siteId] = { tons, year };
      }
    }

    // Rock class source per site.
    const geology = await loadAll(base44.asServiceRole.entities.GeologyRecord, {});
    const geologyBySite: Record<string, any> = {};
    for (const row of geology) {
      if (row.mining_site_id) geologyBySite[row.mining_site_id] = row;
    }

    let computed = 0;
    let skipped = 0;
    let written = 0;
    const errors: string[] = [];

    for (const state of states) {
      const [withPermitted, withParcel] = await Promise.all([
        loadAll(base44.asServiceRole.entities.MiningSite, { state, permitted_acres: { $gt: 0 } }),
        loadAll(base44.asServiceRole.entities.MiningSite, { state, acreage: { $gt: 0 } }),
      ]);

      const sites = Array.from(new Map([...withPermitted, ...withParcel].map((s) => [s.id, s])).values());
      const updates: any[] = [];

      for (const site of sites) {
        computed += 1;
        try {
          const reserve = computeReserveLife({
            site,
            geology: geologyBySite[site.id] || null,
            annualTons: tonsBySite[site.id]?.tons || null,
          });
          if (!reserve) {
            // Clear any figure stored under an earlier assumption set (e.g. coal,
            // which is no longer valued as quarry rock) instead of leaving it stale.
            updates.push({
              id: site.id,
              reserve_tons_low: null,
              reserve_tons_mid: null,
              reserve_tons_high: null,
              reserve_value_low: null,
              reserve_value_mid: null,
              reserve_value_high: null,
              reserve_value_per_acre: null,
              remaining_life_years: null,
              annual_production_tons: null,
              annual_royalty_value: null,
              reserve_computed_at: null,
            });
            skipped += 1;
            continue;
          }
          updates.push({ id: site.id, ...reserve });
        } catch (error) {
          errors.push(`${site.id}: ${(error as Error).message}`);
        }
      }

      for (let i = 0; i < updates.length; i += 200) {
        const chunk = updates.slice(i, i + 200);
        await base44.asServiceRole.entities.MiningSite.bulkUpdate(chunk);
        written += chunk.length;
      }
    }

    return Response.json({
      states,
      candidates: computed,
      written,
      skipped,
      error_count: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.log("build-reserve-life failed", (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}