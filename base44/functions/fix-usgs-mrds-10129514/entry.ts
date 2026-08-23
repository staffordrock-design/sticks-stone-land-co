import { createClientFromRequest } from "npm:@base44/sdk";
import record from "./record.json" with { type: "json" };

function clean(value: unknown) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s || undefined;
}

function asArray(value: any) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values: unknown[], separator = "; ") {
  const out = [...new Set(values.map(clean).filter(Boolean) as string[])];
  return out.length ? out.join(separator) : undefined;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const rows = await base44.asServiceRole.entities.USGSMineralOccurrence.filter({ mrds_id: "10129514" }, "created_date", 20);
    const props: any = (record as any)?.properties || {};
    const dep: any = Array.isArray(props.deposits) ? props.deposits[0] : props.deposits || {};
    const geo: any = Array.isArray(props.geo_coordinates) ? props.geo_coordinates[0] : props.geo_coordinates || {};
    const location: any = Array.isArray(props.location) ? props.location[0] : props.location || {};
    const physiography: any = Array.isArray(props.physiography) ? props.physiography[0] : props.physiography || {};
    const names: any[] = asArray(props.name);
    const commodities: any[] = asArray(props.commodity);
    const materials: any[] = asArray(props.material);
    const refs: any[] = asArray(props.bib_references);
    const dbs: any[] = asArray(props.other_dbs);
    const landStatuses: any[] = asArray(props.land_status);
    const currentName = names.find((n: any) => String(n?.status || "").toLowerCase() === "current") || names[0] || {};
    const primaryCommodity = commodities.find((c: any) => String(c?.import || "").toLowerCase() === "primary") || commodities[0] || {};
    const coordinates = Array.isArray((record as any)?.geometry?.coordinates) ? (record as any).geometry.coordinates : [];

    const payload: any = {
      occurrence_name: clean(currentName?.name) || "Asarco New Market Mine",
      commodity: clean(primaryCommodity?.commod),
      commodity_list: unique(commodities.map((c: any) => c?.commod ? `${clean(c.commod)}${clean(c.import) ? ` (${clean(c.import)})` : ""}` : undefined)),
      mineralogy: unique(materials.map((m: any) => clean(m?.material))),
      development_status: clean(dep?.dev_st),
      operation_type: clean(dep?.oper_tp),
      discovery_year: clean(dep?.disc_yr),
      record_type: clean(dep?.rec_tp),
      mine_method: clean(dep?.min_meth),
      significant: clean(dep?.sig),
      commodity_type: clean(dep?.site_commod_type),
      land_status: unique(landStatuses.map((l: any) => clean(l?.land_st))),
      physiographic_division: clean(physiography?.phys_div),
      physiographic_province: clean(physiography?.phys_prov),
      physiographic_section: clean(physiography?.phys_sect),
      elevation_m: Number.isFinite(Number(geo?.elev)) ? Number(geo.elev) : undefined,
      point_reference: clean(geo?.pnt_ref),
      alternate_names: unique(names.map((n: any) => clean(n?.name)).filter((n: any) => n && n !== clean(currentName?.name))),
      references: unique(refs.map((r: any) => clean(r?.refs)), " | "),
      source_database: unique(dbs.map((d: any) => [clean(d?.agency), clean(d?.db_name) || clean(d?.code), clean(d?.rec_id)].filter(Boolean).join(" · ")), " | "),
      usgs_record_updated: clean(dep?.update_date),
      raw_usgs_json: JSON.stringify(record),
      occurrence_state: "TN",
      occurrence_state_name: clean(location?.state_prov) || "Tennessee",
      occurrence_county: clean(location?.county),
      latitude: Number.isFinite(Number(coordinates[1])) ? Number(coordinates[1]) : undefined,
      longitude: Number.isFinite(Number(coordinates[0])) ? Number(coordinates[0]) : undefined,
      source_url: "https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=10129514",
      last_source_update: new Date().toISOString(),
      notes: "Detailed USGS MRDS JSON repaired from the official direct JSON endpoint after the hosted enrichment request was throttled; raw source snapshot preserved.",
    };
    for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];

    let updated = 0;
    for (const row of rows || []) {
      await base44.asServiceRole.entities.USGSMineralOccurrence.update(row.id, payload);
      updated++;
    }
    return Response.json({ success: true, mrds_id: "10129514", matched_rows: rows?.length || 0, updated, occurrence: payload.occurrence_name });
  } catch (error: any) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
