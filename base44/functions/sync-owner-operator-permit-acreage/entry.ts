import { createClientFromRequest } from "npm:@base44/sdk";

function useful(value: unknown) {
  const text = String(value || "").trim();
  return text && !/pending|unknown|verify|requires verification|not available/i.test(text) ? text : undefined;
}

function positiveNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function same(a: unknown, b: unknown) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

async function loadAllPages(loader: (limit: number, skip: number) => Promise<any[]>, maxRecords = 10000) {
  const rows: any[] = [];
  const pageSize = 500;
  for (let skip = 0; skip < maxRecords; skip += pageSize) {
    const page = await loader(pageSize, skip);
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit || 500), 1), 500);
    const offset = Math.max(Number(body?.offset || 0), 0);
    const sites = await base44.asServiceRole.entities.MiningSite.filter({ state: "TN" }, "created_date", limit, offset);
    const [parcels, permits] = await Promise.all([
      loadAllPages((pageSize, skip) => base44.asServiceRole.entities.ParcelRecord.list("created_date", pageSize, skip)),
      loadAllPages((pageSize, skip) => base44.asServiceRole.entities.TDECPermit.list("created_date", pageSize, skip)),
    ]);

    let updated = 0;
    let ownerLinked = 0;
    let operatorLinked = 0;
    let permitteeLinked = 0;
    let permitAcreageLinked = 0;
    let permitAcreagePending = 0;
    const sample: any[] = [];

    for (const site of sites || []) {
      const parcel = (parcels || []).find((p: any) =>
        same(p.parcel_id, site.parcel_id) ||
        same(p.msha_mine_id, site.msha_mine_id) ||
        same(p.tdec_permit_number, site.tdec_permit_number)
      );

      const relatedPermits = (permits || []).filter((p: any) =>
        same(p.msha_mine_id, site.msha_mine_id) ||
        same(p.permit_number, site.tdec_permit_number) ||
        same(p.npdes_permit_number, site.npdes_permit_number) ||
        (same(p.county, site.county) && same(p.facility_name, site.mine_name))
      );
      const permit = relatedPermits.find((p: any) => positiveNumber(p.permitted_acres)) || relatedPermits[0];

      const owner = useful(parcel?.owner_name) || useful(site.parcel_owner);
      const operator = useful(site.operator_name) || useful(permit?.operator_name);
      const permittee = useful(permit?.permittee_name) || useful(site.permittee_name);
      const permittedAcres = positiveNumber(permit?.permitted_acres) || positiveNumber(site.permitted_acres);
      const acreageBasis = useful(permit?.acreage_basis) || useful(site.permitted_acres_basis);
      const acreageSourceUrl = useful(permit?.acreage_source_url) || useful(permit?.source_url) || useful(site.permitted_acres_source_url);
      const acreageVerified = useful(permit?.acreage_last_verified) || useful(permit?.last_source_update) || useful(site.permitted_acres_last_verified);

      const patch: any = {};
      if (owner && owner !== site.parcel_owner) patch.parcel_owner = owner;
      if (!useful(site.operator_name) && operator) patch.operator_name = operator;
      if (permittee && permittee !== site.permittee_name) patch.permittee_name = permittee;
      if (permittedAcres && Number(site.permitted_acres) !== permittedAcres) patch.permitted_acres = permittedAcres;
      if (permittedAcres && acreageBasis && acreageBasis !== site.permitted_acres_basis) patch.permitted_acres_basis = acreageBasis;
      if (permittedAcres && acreageSourceUrl && acreageSourceUrl !== site.permitted_acres_source_url) patch.permitted_acres_source_url = acreageSourceUrl;
      if (permittedAcres && acreageVerified && acreageVerified !== site.permitted_acres_last_verified) patch.permitted_acres_last_verified = acreageVerified;

      if (Object.keys(patch).length) {
        await base44.asServiceRole.entities.MiningSite.update(site.id, patch);
        updated++;
      }

      if (owner) ownerLinked++;
      if (operator) operatorLinked++;
      if (permittee) permitteeLinked++;
      if (permittedAcres) permitAcreageLinked++;
      else permitAcreagePending++;

      if (sample.length < 20) {
        sample.push({
          mine: site.mine_name,
          msha: site.msha_mine_id || null,
          owner: owner || null,
          operator: operator || null,
          permittee: permittee || null,
          permitted_acres: permittedAcres || null,
          permit_acreage_basis: acreageBasis || null,
          parcel_acres: positiveNumber(parcel?.acreage) || positiveNumber(site.acreage) || null,
        });
      }
    }

    return Response.json({
      success: true,
      offset,
      queried: (sites || []).length,
      next_offset: offset + (sites || []).length,
      has_more: (sites || []).length === limit,
      parcels_scanned: (parcels || []).length,
      permits_scanned: (permits || []).length,
      updated,
      owner_linked: ownerLinked,
      operator_linked: operatorLinked,
      permittee_linked: permitteeLinked,
      permitted_acres_linked: permitAcreageLinked,
      permitted_acres_pending: permitAcreagePending,
      sample,
      note: "Owner is sourced from parcel/assessment records; current operator is sourced from MSHA when available; permittee and permitted acreage are sourced only from connected permit records. Parcel acreage is never substituted for permitted mining acreage.",
    });
  } catch (error: any) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
