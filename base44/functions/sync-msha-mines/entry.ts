import { createClientFromRequest } from "npm:@base44/sdk";
import { unzipSync, strFromU8 } from "npm:fflate";

const DATA_URL = "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Mines.zip";
const SOURCE_PAGE = "https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp";
const SOUTHEAST_STATES = new Set(["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"]);
const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  TN: { minLat: 34.8, maxLat: 36.8, minLng: -90.5, maxLng: -81.5 },
  GA: { minLat: 30.2, maxLat: 35.2, minLng: -85.8, maxLng: -80.6 },
  AL: { minLat: 30.1, maxLat: 35.2, minLng: -88.7, maxLng: -84.7 },
  KY: { minLat: 36.3, maxLat: 39.3, minLng: -89.8, maxLng: -81.8 },
  NC: { minLat: 33.7, maxLat: 36.8, minLng: -84.5, maxLng: -75.2 },
  SC: { minLat: 31.9, maxLat: 35.3, minLng: -83.5, maxLng: -78.3 },
  FL: { minLat: 24.2, maxLat: 31.2, minLng: -87.8, maxLng: -79.7 },
  MS: { minLat: 30.0, maxLat: 35.2, minLng: -91.8, maxLng: -87.9 },
};

function clean(v: unknown) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || undefined;
}

function num(v: unknown) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function validStateCoordinate(state: string | undefined, lat: number | undefined, lng: number | undefined) {
  if (lat == null || lng == null) return false;
  const bounds = STATE_BOUNDS[String(state || "").toUpperCase()];
  if (!bounds) return lat >= 24 && lat <= 40 && lng >= -92 && lng <= -75;
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

function rowsFromPipeText(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split("|").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split("|");
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

async function upsertFreshness(base44: any, payload: any) {
  const existing = await base44.asServiceRole.entities.DataFreshnessStatus.filter({ source: "MSHA" }, "-updated_date", 1, 0);
  if (existing?.[0]) return base44.asServiceRole.entities.DataFreshnessStatus.update(existing[0].id, payload);
  return base44.asServiceRole.entities.DataFreshnessStatus.create({ source: "MSHA", ...payload });
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const now = new Date().toISOString();
    const response = await fetch(DATA_URL, {
      headers: { "User-Agent": "SSRockHoldings/1.0 quarry-intelligence" },
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error(`MSHA Mines dataset request failed: ${response.status}`);

    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const fileName = Object.keys(archive).find((n) => /mine/i.test(n) && /\.txt$|\.csv$|\.dat$/i.test(n)) || Object.keys(archive)[0];
    if (!fileName) throw new Error("MSHA Mines archive contained no data file");
    const rows = rowsFromPipeText(strFromU8(archive[fileName]));
    const southeast = rows.filter((r: any) => SOUTHEAST_STATES.has(String(r.STATE || "").trim().toUpperCase()));

    const existing: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await base44.asServiceRole.entities.MiningSite.list("-updated_date", 500, offset);
      existing.push(...(page || []));
      if (!page || page.length < 500) break;
    }
    const byMineId = new Map<string, any[]>();
    for (const site of existing || []) {
      const id = clean(site.msha_mine_id);
      if (!id) continue;
      if (!byMineId.has(id)) byMineId.set(id, []);
      byMineId.get(id)!.push(site);
    }

    let created = 0;
    let updated = 0;
    let duplicateIds = 0;
    const sample: any[] = [];

    for (const r of southeast) {
      const mineId = clean(r.MINE_ID);
      if (!mineId) continue;
      const state = clean(r.STATE)?.toUpperCase();
      const latitude = num(r.LATITUDE);
      const longitude = num(r.LONGITUDE);
      const coordinatesValid = validStateCoordinate(state, latitude, longitude);
      const official = {
        source: "MSHA",
        source_record_id: mineId,
        msha_mine_id: mineId,
        mine_name: clean(r.CURRENT_MINE_NAME) || `MSHA ${mineId}`,
        mine_status: clean(r.CURRENT_MINE_STATUS),
        mine_type: clean(r.CURRENT_MINE_TYPE),
        commodity: clean(r.PRIMARY_SIC) || clean(r.PRIMARY_CANVASS),
        operator_name: clean(r.CURRENT_OPERATOR_NAME),
        controller_name: clean(r.CURRENT_CONTROLLER_NAME),
        county: clean(r.FIPS_CNTY_NM)?.replace(/\s+County$/i, ""),
        state,
        city: clean(r.NEAREST_TOWN),
        latitude: coordinatesValid ? latitude : undefined,
        longitude: coordinatesValid ? longitude : undefined,
        source_url: SOURCE_PAGE,
        last_source_update: now,
      };

      const matches = byMineId.get(mineId) || [];
      if (!matches.length) {
        const createdSite = await base44.asServiceRole.entities.MiningSite.create(official);
        byMineId.set(mineId, [createdSite]);
        created++;
      } else {
        if (matches.length > 1) duplicateIds++;
        // Update every record carrying this unique MSHA ID so older imports cannot disagree.
        for (const site of matches) {
          const merged = {
            ...official,
            // Preserve S&S-linked fields that MSHA does not own.
            tdec_permit_number: site.tdec_permit_number || undefined,
            npdes_permit_number: site.npdes_permit_number || undefined,
            parcel_id: site.parcel_id || undefined,
            parcel_owner: site.parcel_owner || undefined,
            acreage: site.acreage ?? undefined,
            permittee_name: site.permittee_name || undefined,
            permitted_acres: site.permitted_acres ?? undefined,
            permitted_acres_basis: site.permitted_acres_basis || undefined,
            permitted_acres_source_url: site.permitted_acres_source_url || undefined,
            permitted_acres_last_verified: site.permitted_acres_last_verified || undefined,
            site_images: site.site_images || undefined,
            photo_condition_score: site.photo_condition_score ?? undefined,
            photo_notes: site.photo_notes || undefined,
            is_verified_listing: Boolean(site.is_verified_listing),
            listing_id: site.listing_id || undefined,
            notes: site.notes || undefined,
          };
          await base44.asServiceRole.entities.MiningSite.update(site.id, merged);
          updated++;
        }
      }
      if (sample.length < 12) sample.push({ mine_id: mineId, name: official.mine_name, status: official.mine_status, operator: official.operator_name });
    }

    await upsertFreshness(base44, {
      last_sync_at: now,
      latest_source_period: now.slice(0, 10),
      status: "Current",
      records_updated: created + updated,
      error_message: null,
    });

    return Response.json({
      success: true,
      source: DATA_URL,
      official_southeast_records: southeast.length,
      created,
      updated,
      duplicate_msha_ids_found: duplicateIds,
      sample,
      states: Array.from(SOUTHEAST_STATES),
      note: "MSHA Mine ID is treated as the authoritative unique key across the Southeast. Official MSHA fields are refreshed; S&S parcel, permit, permit-acreage, imagery and listing fields are preserved.",
    });
  } catch (error: any) {
    const message = error?.message || String(error);
    try {
      await upsertFreshness(base44, {
        last_sync_at: new Date().toISOString(),
        latest_source_period: null,
        status: "Error",
        records_updated: 0,
        error_message: message,
      });
    } catch (_) {}
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
