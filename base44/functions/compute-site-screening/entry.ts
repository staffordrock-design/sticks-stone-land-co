import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { buildSiteScreening } from "../../shared/siteScreening.ts";

// Computes the S&S Opportunity Score and S&S Estimate range ONCE with the complete
// source data and stores the result on each MiningSite record. Every page then
// displays the stored number, so a score can no longer change between loads.
const SOUTHEAST_STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const PAGE = 500;

function hasValue(v: any) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function isQuarryRelevant(site: any) {
  const commodity = String(site?.commodity || "").toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes("coal")) return false;
  return ["stone", "limestone", "sand", "gravel", "aggregate", "marble", "granite", "slate", "shale", "quartz", "clay", "dolomite", "rock", "lime"].some((term) => commodity.includes(term));
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const states: string[] = Array.isArray(body?.states) && body.states.length ? body.states.map((s: any) => String(s).toUpperCase()) : SOUTHEAST_STATES;
    const maxSites = Math.max(500, Math.min(40000, Number(body?.max_sites) || 6000));
    const onlyMissing = Boolean(body?.only_missing);
    const svc = base44.asServiceRole;

    // Supporting datasets are small and complete; load each once per run.
    const [parcels, geologyRows, permitRows, environmentalRows, profiles, comps] = await Promise.all([
      svc.entities.ParcelRecord.list("-updated_date", 4000).catch(() => []),
      svc.entities.GeologyRecord.list("-updated_date", 4000).catch(() => []),
      svc.entities.TDECPermit.list("-last_source_update", 4000).catch(() => []),
      svc.entities.EnvironmentalRecord.list("-last_source_update", 4000).catch(() => []),
      svc.entities.QuarryPotentialProfile.list("-updated_date", 500).catch(() => []),
      svc.entities.QuarryComparable.list("-updated_date", 500).catch(() => []),
    ]);

    const parcelFor = (s: any) => (parcels || []).find((p: any) =>
      (hasValue(s.parcel_id) && p.parcel_id === s.parcel_id) || (hasValue(s.msha_mine_id) && p.msha_mine_id === s.msha_mine_id)
    );
    const geologyFor = (s: any) => (geologyRows || []).find((g: any) =>
      g.mining_site_id === s.id || (hasValue(s.msha_mine_id) && g.msha_mine_id === s.msha_mine_id) || (hasValue(s.parcel_id) && g.parcel_id === s.parcel_id)
    );
    const permitsFor = (s: any) => (permitRows || []).filter((p: any) =>
      (hasValue(s.msha_mine_id) && p.msha_mine_id === s.msha_mine_id) || (hasValue(s.tdec_permit_number) && p.permit_number === s.tdec_permit_number)
    );
    const environmentalFor = (s: any) => (environmentalRows || []).filter((r: any) =>
      (hasValue(s.msha_mine_id) && r.msha_mine_id === s.msha_mine_id) || (hasValue(s.npdes_permit_number) && r.npdes_permit_number === s.npdes_permit_number)
    );
    const profileFor = (s: any) => (profiles || []).find((p: any) =>
      p.mining_site_id === s.id || (hasValue(s.msha_mine_id) && p.msha_mine_id === s.msha_mine_id)
    );

    let scanned = 0;
    let written = 0;
    let skipped = 0;
    // Keyed by id: paginating while writing updates the rows' timestamps, so a
    // page can hand back a record that was already queued for this batch.
    let pending = new Map<string, any>();

    const flush = async () => {
      if (!pending.size) return;
      await svc.entities.MiningSite.bulkUpdate(Array.from(pending.values()));
      written += pending.size;
      pending = new Map();
    };

    for (const state of states) {
      if (scanned >= maxSites) break;
      let offset = 0;
      let hasMore = true;
      while (hasMore && scanned < maxSites) {
        // Stable sort: writing a record changes its updated_date, which would
        // otherwise reshuffle the pages being walked.
        const page = await svc.entities.MiningSite.filter({ state }, "-created_date", PAGE, offset).catch(() => []);
        const rows = page || [];
        offset += rows.length;
        hasMore = rows.length === PAGE;

        for (const site of rows) {
          scanned += 1;
          if (!site?.id || !isQuarryRelevant(site)) continue;
          if (onlyMissing && site.screening_computed_at) { skipped += 1; continue; }

          const stored = buildSiteScreening({
            site,
            parcel: parcelFor(site),
            geology: geologyFor(site),
            permits: permitsFor(site),
            environmental: environmentalFor(site),
            profile: profileFor(site),
            comps: comps || [],
          });

          pending.set(site.id, { id: site.id, ...stored });
          if (pending.size >= PAGE) await flush();
        }
      }
    }
    await flush();

    return Response.json({ ok: true, scanned, written, skipped, states });
  } catch (error: any) {
    console.error("compute-site-screening error:", error?.message || error);
    return Response.json({ error: error?.message || "Failed to compute screening" }, { status: 500 });
  }
}