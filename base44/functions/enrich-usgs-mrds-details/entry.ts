import { createClientFromRequest } from "npm:@base44/sdk";

const MRDS_JSON_BASE = "https://mrdata.usgs.gov/mrds/json/";

function clean(value: unknown) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s || undefined;
}

function asArray<T = any>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values: unknown[], separator = "; ") {
  const out = [...new Set(values.map(clean).filter(Boolean) as string[])];
  return out.length ? out.join(separator) : undefined;
}

function collectKeys(root: any, keys: string[]) {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const values: unknown[] = [];
  const walk = (value: any) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (wanted.has(String(key).toLowerCase()) && (typeof child === "string" || typeof child === "number" || typeof child === "boolean")) values.push(child);
      if (typeof child === "object" && child != null) walk(child);
    }
  };
  walk(root);
  return values;
}

function firstObject(value: any) {
  return asArray(value).find((v) => v && typeof v === "object") || {};
}

function elevationMeters(geo: any) {
  const n = Number(geo?.elev);
  if (!Number.isFinite(n)) return undefined;
  const unit = String(geo?.elev_u || "m").toLowerCase();
  if (unit === "ft" || unit.includes("feet") || unit.includes("foot")) return Math.round(n * 0.3048 * 10) / 10;
  return n;
}

function capped(value: unknown, max = 6000) {
  const s = clean(value);
  if (!s) return undefined;
  return s.length <= max ? s : `${s.slice(0, max - 18)}… [truncated]`;
}

function compactSourceSnapshot(detail: any) {
  const props = detail?.properties || {};
  const snapshot = {
    id: detail?.id,
    type: detail?.type,
    geometry: detail?.geometry,
    properties: {
      grade: props.grade,
      deposits: props.deposits,
      name: props.name,
      geo_coordinates: props.geo_coordinates,
      location: props.location,
      commodity: props.commodity,
      material: props.material,
      ownership: props.ownership,
      land_status: props.land_status,
      holdings: props.holdings,
      physiography: props.physiography,
      districts: props.districts,
      other_dbs: props.other_dbs,
    },
  };
  return capped(JSON.stringify(snapshot), 9000);
}

async function fetchMrdsDetail(mrdsId: string) {
  const url = `${MRDS_JSON_BASE}${encodeURIComponent(mrdsId)}`;
  let lastError: any = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "SSRockHoldings/1.0 quarry-intelligence",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`USGS MRDS JSON ${response.status}`);
      return await response.json();
    } catch (error: any) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw lastError || new Error("USGS MRDS JSON request failed");
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const state = String(body?.state || "TN").trim().toUpperCase();
    const stateNames: Record<string, string> = { TN: "Tennessee" };
    const stateName = stateNames[state] || state;
    const limit = Math.min(Math.max(Number(body?.limit) || 60, 1), 100);
    const offset = Math.max(Number(body?.offset) || 0, 0);
    const concurrency = Math.min(Math.max(Number(body?.concurrency) || 6, 1), 8);
    const requestedMrdsId = clean(body?.mrds_id);

    const rows = requestedMrdsId
      ? await base44.asServiceRole.entities.USGSMineralOccurrence.filter({ mrds_id: requestedMrdsId }, "created_date", 20, 0)
      : await base44.asServiceRole.entities.USGSMineralOccurrence.filter({
          $or: [{ occurrence_state: state }, { occurrence_state: stateName }, { occurrence_state_name: stateName }],
        }, "created_date", limit, offset);

    let queried = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let withDepositType = 0;
    let withOperationType = 0;
    let withMineralogy = 0;
    let withHostRock = 0;
    let withProductionSize = 0;
    const sample: any[] = [];

    for (let i = 0; i < (rows || []).length; i += concurrency) {
      const group = (rows || []).slice(i, i + concurrency);
      await Promise.all(group.map(async (row: any) => {
        const mrdsId = clean(row.mrds_id);
        if (!mrdsId) {
          skipped++;
          return;
        }
        queried++;
        try {
          const detail = await fetchMrdsDetail(mrdsId);
          const props = detail?.properties || {};
          const dep = firstObject(props.deposits);
          const geo = firstObject(props.geo_coordinates);
          const location = firstObject(props.location);
          const physiography = firstObject(props.physiography);
          const names = asArray(props.name);
          const commodities = asArray(props.commodity);
          const landStatuses = asArray(props.land_status);
          const refs = asArray(props.bib_references);
          const dbs = asArray(props.other_dbs);

          const currentName = names.find((n: any) => String(n?.status || "").toLowerCase() === "current") || names[0] || {};
          const primaryCommodity = commodities.find((c: any) => String(c?.import || "").toLowerCase() === "primary") || commodities[0] || {};
          const commodityList = unique(commodities.map((c: any) => {
            const name = clean(c?.commod);
            const importance = clean(c?.import);
            return name ? (importance ? `${name} (${importance})` : name) : undefined;
          }));

          const ores = unique(collectKeys(props, ["ore", "ore_mineral", "ore_minerals"]));
          const gangue = unique(collectKeys(props, ["gangue", "gangue_mineral", "gangue_minerals"]));
          const otherMinerals = unique(collectKeys(props, ["mineralogy", "minerals", "material"]));
          const mineralogy = unique([
            ores ? `Ore: ${ores}` : undefined,
            gangue ? `Gangue: ${gangue}` : undefined,
            otherMinerals ? `Other: ${otherMinerals}` : undefined,
          ], " · ");

          const depositType = clean(dep?.dep_tp) || clean(collectKeys(props, ["dep_type", "deposit_type"])[0]);
          const operationType = clean(dep?.oper_tp) || clean(collectKeys(props, ["oper_type", "operation_type"])[0]);
          const geologicModel = unique(collectKeys(props, ["model", "model_name", "deposit_model", "geol_model"]));
          const hostRock = unique(collectKeys(props, ["hrock_unit", "hrock_type", "host_rock", "hostrock"]));
          const associatedRock = unique(collectKeys(props, ["arock_unit", "arock_type", "associated_rock", "assoc_rock"]));
          const discoveryYear = clean(collectKeys(props, ["disc_year", "disc_yr", "year_disc", "yr_disc"])[0]);
          const productionSize = clean(dep?.prod_size) || clean(collectKeys(props, ["prod_size", "production_size"])[0]);
          const coordinates = Array.isArray(detail?.geometry?.coordinates) ? detail.geometry.coordinates : [];
          const lon = Number(coordinates[0]);
          const lat = Number(coordinates[1]);

          const alternateNames = unique(names
            .map((n: any) => clean(n?.name))
            .filter((n: any) => n && n !== clean(currentName?.name)));
          const references = capped(unique(refs.map((r: any) => clean(r?.refs)), " | "));
          const sourceDatabase = unique(dbs.map((d: any) => {
            const agency = clean(d?.agency);
            const db = clean(d?.db_name) || clean(d?.code);
            const rec = clean(d?.rec_id);
            return [agency, db, rec].filter(Boolean).join(" · ") || undefined;
          }), " | ");

          const payload: any = {
            occurrence_name: clean(currentName?.name) || row.occurrence_name,
            commodity: clean(primaryCommodity?.commod) || row.commodity,
            commodity_list: commodityList || row.commodity_list,
            mineralogy,
            deposit_type: depositType,
            development_status: clean(dep?.dev_st) || row.development_status,
            operation_type: operationType,
            geologic_model: geologicModel,
            host_rock: hostRock,
            associated_rock: associatedRock,
            production_size: productionSize,
            discovery_year: discoveryYear,
            record_type: clean(dep?.rec_tp),
            mine_method: clean(dep?.min_meth),
            deposit_size: clean(dep?.deposit_size),
            significant: clean(dep?.sig),
            commodity_type: clean(dep?.site_commod_type),
            land_status: unique(landStatuses.map((l: any) => clean(l?.land_st))),
            physiographic_division: clean(physiography?.phys_div),
            physiographic_province: clean(physiography?.phys_prov),
            physiographic_section: clean(physiography?.phys_sect),
            elevation_m: elevationMeters(geo),
            point_reference: clean(geo?.pnt_ref),
            alternate_names: alternateNames,
            references,
            source_database: sourceDatabase,
            usgs_record_updated: clean(dep?.update_date),
            raw_usgs_json: compactSourceSnapshot(detail),
            occurrence_state: state,
            occurrence_state_name: clean(location?.state_prov) || stateName,
            occurrence_county: clean(location?.county) || row.occurrence_county,
            latitude: Number.isFinite(lat) ? lat : row.latitude,
            longitude: Number.isFinite(lon) ? lon : row.longitude,
            source_url: row.source_url || `https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=${encodeURIComponent(mrdsId)}`,
            last_source_update: new Date().toISOString(),
            notes: `${row.notes || ""}${row.notes ? " " : ""}Detailed USGS MRDS JSON refreshed; raw source snapshot preserved.`,
          };

          // Remove undefined values so a sparse USGS record does not erase already useful data.
          for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];

          await base44.asServiceRole.entities.USGSMineralOccurrence.update(row.id, payload);
          updated++;
          if (depositType) withDepositType++;
          if (operationType) withOperationType++;
          if (mineralogy) withMineralogy++;
          if (hostRock) withHostRock++;
          if (productionSize) withProductionSize++;

          if (sample.length < 12) sample.push({
            mrds_id: mrdsId,
            occurrence: payload.occurrence_name,
            commodity: payload.commodity,
            deposit_type: depositType || null,
            operation_type: operationType || null,
            mine_method: payload.mine_method || null,
            deposit_size: payload.deposit_size || null,
            production_size: productionSize || null,
            host_rock: hostRock || null,
          });
        } catch (error: any) {
          console.error("USGS MRDS detail enrichment failed", mrdsId, error?.message || error);
          errors++;
        }
      }));
    }

    return Response.json({
      success: true,
      state,
      offset,
      source_rows: (rows || []).length,
      queried,
      updated,
      skipped,
      errors,
      with_deposit_type: withDepositType,
      with_operation_type: withOperationType,
      with_mineralogy: withMineralogy,
      with_host_rock: withHostRock,
      with_production_size: withProductionSize,
      next_offset: offset + (rows || []).length,
      has_more: (rows || []).length === limit,
      sample,
      note: "Detailed enrichment reads each official USGS MRDS JSON record and preserves both normalized quarry intelligence fields and the raw source snapshot. Missing USGS fields remain blank rather than inferred.",
    });
  } catch (error: any) {
    console.error("enrich-usgs-mrds-details error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
