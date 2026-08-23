import { createClientFromRequest } from "npm:@base44/sdk";

const DMGR_QUERY = "https://tdeconline.tn.gov/arcgis/rest/services/DMGR_Permits_DV/MapServer/0/query";
const DMGR_LAYER = "https://tdeconline.tn.gov/arcgis/rest/services/DMGR_Permits_DV/MapServer/0";

function text(value: unknown) {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function positive(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function epochDate(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function decodeHtml(value: string) {
  return String(value || "")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x20;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/\b(dba|d\/b\/a)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|incorporated|llc|ltd|lp|company|co|corporation|corp|materials|construction)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["the", "and", "of", "at", "mine", "mining", "plant", "site", "property", "area"]);
function tokenSet(value: unknown) {
  return new Set(normalize(value).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));
}

function overlap(a: unknown, b: unknown) {
  const aa = tokenSet(a);
  const bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const t of aa) if (bb.has(t)) common++;
  return common / Math.min(aa.size, bb.size);
}

function countyKey(value: unknown) {
  return normalize(value).replace(/\bcounty\b/g, "").replace(/\s+/g, "").trim();
}

function validTnCoordinates(lat: unknown, lng: unknown) {
  const y = Number(lat);
  const x = Number(lng);
  return Number.isFinite(y) && Number.isFinite(x) && y >= 34.8 && y <= 36.8 && x >= -90.5 && x <= -81.5;
}

function miles(lat1: unknown, lon1: unknown, lat2: unknown, lon2: unknown) {
  if (![lat1, lon1, lat2, lon2].every((v) => Number.isFinite(Number(v)))) return Infinity;
  const r = 3958.7613;
  const p1 = Number(lat1) * Math.PI / 180;
  const p2 = Number(lat2) * Math.PI / 180;
  const dp = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const dl = (Number(lon2) - Number(lon1)) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function quarryRelevant(site: any) {
  const commodity = String(site?.commodity || "").toLowerCase().trim();
  if (commodity.includes("coal")) return false;
  if (!commodity) return true;
  return ["stone", "limestone", "sand", "gravel", "aggregate", "marble", "granite", "slate", "shale", "quartz", "clay", "dolomite", "rock", "lime"]
    .some((term) => commodity.includes(term));
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "S&S Rock Holdings quarry intelligence / public data sync" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`TDEC DMGR request failed (${response.status})`);
  return await response.json();
}

async function fetchPermitBatch(offset: number, limit: number) {
  const params = new URLSearchParams({
    where: "PERMIT_TYPE IN ('Mining','Surface Mining')",
    outFields: "OBJECTID,SITE_ID,PERMIT_NUMBER,PERMIT_TYPE,PERMITTEE_NAME,PERMIT_STATUS,PROJECT_NAME,MAJOR_MINOR,FACILITY_PERMIT_CLASS,DISCHARGE_CODE,ISSUANCE_DATE,EFFECTIVE_DATE,EXPIRATION_DATE,SIC_CODE,PERMIT_ACRES,DISTURB_ACRES,SITE,COUNTY,LATITUDE,LONGITUDE,DESCRIPTION_OF_ACTIVITY,URL",
    returnGeometry: "false",
    orderByFields: "OBJECTID ASC",
    resultOffset: String(offset),
    resultRecordCount: String(limit),
    f: "json",
  });
  const data = await fetchJson(`${DMGR_QUERY}?${params.toString()}`);
  if (data?.error) throw new Error(data.error.message || "TDEC DMGR ArcGIS error");
  return data?.features || [];
}

async function fetchAllPermitFeatures(max = 3000) {
  const rows: any[] = [];
  for (let offset = 0; offset < max; offset += 500) {
    const page = await fetchPermitBatch(offset, 500);
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}

function daysSince(value: unknown) {
  const t = new Date(String(value || "")).getTime();
  return Number.isFinite(t) ? (Date.now() - t) / 86400000 : Infinity;
}

async function fetchMiningSpecific(sourceUrl: string | undefined) {
  if (!sourceUrl) return null;
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 S&S Rock Holdings public-data research" },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const tables = html.match(/<table[^>]*aria-label="Mining Specific"[\s\S]*?<\/table>/gi) || [];
    for (const table of tables) {
      const row = table.match(/<tbody[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1];
      if (!row) continue;
      const values: Record<string, string> = {};
      const re = /<td[^>]*headers="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(row))) values[m[1]] = decodeHtml(m[2]);
      const acreage = positive(values.ACREAGE);
      if (acreage) {
        return {
          acreage,
          mine_name: text(values.MINE_NAME),
          industry_group: text(values.INDUSTRY_GROUP),
          primary_mineral: text(values.PRIMARY_MINERAL),
          reclamation: text(values.RECLAMATION),
        };
      }
    }
  } catch {
    // Detail-page acreage is an enhancement; the ArcGIS permit record is still usable.
  }
  return null;
}

async function loadAll(base44: any, entity: string, sort: string, max = 10000) {
  const rows: any[] = [];
  for (let skip = 0; skip < max; skip += 500) {
    const page = await base44.asServiceRole.entities[entity].list(sort, 500, skip);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

function matchSite(attrs: any, sites: any[]) {
  const dmgrName = [attrs.PROJECT_NAME, attrs.SITE].filter(Boolean).join(" ");
  const permittee = attrs.PERMITTEE_NAME;
  const dmgrCounty = countyKey(attrs.COUNTY);
  const lat = number(attrs.LATITUDE);
  const lng = number(attrs.LONGITUDE);
  const scored: any[] = [];

  for (const site of sites) {
    const siteCounty = countyKey(site.county);
    if (dmgrCounty && siteCounty && dmgrCounty !== siteCounty) continue;

    const distance = miles(lat, lng, site.latitude, site.longitude);
    const n1 = normalize(dmgrName);
    const n2 = normalize(site.mine_name);
    const nameContains = Boolean(n1 && n2 && (n1.includes(n2) || n2.includes(n1)));
    const nameOverlap = overlap(dmgrName, site.mine_name);
    const operatorOverlap = overlap(permittee, site.operator_name);

    let score = 0;
    if (dmgrCounty && siteCounty && dmgrCounty === siteCounty) score += 2;
    if (distance <= 0.25) score += 9;
    else if (distance <= 0.75) score += 7;
    else if (distance <= 2) score += 4;
    else if (distance <= 5) score += 1;

    if (nameContains) score += 8;
    else if (nameOverlap >= 0.75) score += 7;
    else if (nameOverlap >= 0.5) score += 5;
    else if (nameOverlap >= 0.3) score += 2;

    if (operatorOverlap >= 0.75) score += 4;
    else if (operatorOverlap >= 0.5) score += 2;

    const strongName = nameContains || nameOverlap >= 0.5;
    if (score >= 8 && (distance <= 2 || strongName)) {
      scored.push({ site, score, distance, nameOverlap, nameContains });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.distance - b.distance);
  if (!scored.length) return null;
  if (scored[1] && scored[0].score - scored[1].score < 2 && scored[0].distance > 0.25) return null;
  return scored[0];
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const explicitOffset = body?.offset !== undefined && body?.offset !== null;
    const offset = Math.max(Number(body?.offset || 0), 0);
    const limit = Math.min(Math.max(Number(body?.limit || 60), 1), 150);

    const [sourceFeatures, allSites, existingPermits] = await Promise.all([
      explicitOffset ? fetchPermitBatch(offset, limit) : fetchAllPermitFeatures(),
      loadAll(base44, "MiningSite", "created_date", 10000),
      loadAll(base44, "TDECPermit", "created_date", 10000),
    ]);
    const tnSites = allSites.filter((s) => String(s.state || "").toUpperCase() === "TN" && quarryRelevant(s));
    const permitByNumber = new Map(existingPermits.filter((p) => p.permit_number).map((p) => [String(p.permit_number), p]));

    const features = explicitOffset ? sourceFeatures : sourceFeatures
      .filter((f: any) => {
        const a = f.attributes || {};
        const existing = permitByNumber.get(String(a.PERMIT_NUMBER || ""));
        if (!existing) return true;
        const dmgrBacked = /dataviewers\.tdec\.tn\.gov|DMGR_Permits_DV/i.test(String(existing.source_url || existing.acreage_source_url || ""));
        if (!dmgrBacked) return true;
        if (String(a.PERMIT_TYPE || "") === "Mining" && !positive(existing.permitted_acres) && daysSince(existing.last_source_update) >= 30) return true;
        return daysSince(existing.last_source_update) >= 30;
      })
      .sort((a: any, b: any) => {
        const ae = permitByNumber.get(String(a.attributes?.PERMIT_NUMBER || ""));
        const be = permitByNumber.get(String(b.attributes?.PERMIT_NUMBER || ""));
        return Number(Boolean(ae)) - Number(Boolean(be));
      })
      .slice(0, limit);

    let created = 0;
    let updated = 0;
    let matched = 0;
    let acreageLoaded = 0;
    let siteAcreageUpdated = 0;
    let ambiguousOrUnmatched = 0;
    const sample: any[] = [];

    const detailResults: any[] = [];
    const concurrency = 5;
    for (let i = 0; i < features.length; i += concurrency) {
      const group = features.slice(i, i + concurrency);
      const rows = await Promise.all(group.map(async (f: any) => {
        const a = f.attributes || {};
        const existing = permitByNumber.get(String(a.PERMIT_NUMBER || ""));
        const alreadyHasAcres = positive(a.PERMIT_ACRES) || positive(existing?.permitted_acres);
        const detail = a.PERMIT_TYPE === "Mining" && !alreadyHasAcres ? await fetchMiningSpecific(text(a.URL)) : null;
        return { feature: f, detail };
      }));
      detailResults.push(...rows);
    }

    for (const row of detailResults) {
      const a = row.feature.attributes || {};
      const permitNumber = text(a.PERMIT_NUMBER);
      if (!permitNumber) continue;
      const existing = permitByNumber.get(permitNumber);
      const match = matchSite(a, tnSites);
      const detailAcres = positive(row.detail?.acreage);
      const gisAcres = positive(a.PERMIT_ACRES);
      const permitAcres = detailAcres || gisAcres || positive(existing?.permitted_acres);
      const sourceUrl = text(a.URL) || DMGR_LAYER;
      const verifiedAt = new Date().toISOString();
      const facilityName = text(a.PROJECT_NAME) || text(a.SITE) || text(row.detail?.mine_name);

      const payload: any = {
        permit_number: permitNumber,
        permit_type: text(a.PERMIT_TYPE) || "Mining",
        facility_name: facilityName,
        permittee_name: text(a.PERMITTEE_NAME),
        status: text(a.PERMIT_STATUS),
        county: text(a.COUNTY),
        state: "TN",
        latitude: number(a.LATITUDE),
        longitude: number(a.LONGITUDE),
        msha_mine_id: match?.site?.msha_mine_id || existing?.msha_mine_id || undefined,
        npdes_permit_number: String(a.PERMIT_TYPE || "") === "Mining" && /^TN/i.test(permitNumber) ? permitNumber : existing?.npdes_permit_number || undefined,
        surface_mining_permit_number: String(a.PERMIT_TYPE || "") === "Surface Mining" ? permitNumber : existing?.surface_mining_permit_number || undefined,
        permitted_acres: permitAcres,
        acreage_basis: permitAcres ? (detailAcres ? "TDEC DMGR permit detail — Mining Specific acreage" : "TDEC DMGR published permit acreage") : undefined,
        acreage_source_url: permitAcres ? sourceUrl : undefined,
        acreage_last_verified: permitAcres ? verifiedAt : undefined,
        effective_date: epochDate(a.EFFECTIVE_DATE),
        expiration_date: epochDate(a.EXPIRATION_DATE),
        source_url: sourceUrl,
        last_source_update: verifiedAt,
        notes: [
          "Official Tennessee Department of Environment & Conservation, Division of Mineral & Geologic Resources permit record.",
          text(a.DESCRIPTION_OF_ACTIVITY) ? `Activity: ${text(a.DESCRIPTION_OF_ACTIVITY)}` : null,
          row.detail?.industry_group ? `Mining specific industry: ${row.detail.industry_group}` : null,
          row.detail?.primary_mineral ? `Primary mineral: ${row.detail.primary_mineral}` : null,
        ].filter(Boolean).join(" "),
      };

      if (existing?.id) {
        await base44.asServiceRole.entities.TDECPermit.update(existing.id, payload);
        updated++;
      } else {
        const made = await base44.asServiceRole.entities.TDECPermit.create(payload);
        permitByNumber.set(permitNumber, made);
        created++;
      }

      if (permitAcres) acreageLoaded++;

      if (match?.site) {
        matched++;
        const site = match.site;
        const patch: any = {};
        if (!site.tdec_permit_number) patch.tdec_permit_number = permitNumber;
        if (!site.permittee_name && payload.permittee_name) patch.permittee_name = payload.permittee_name;
        if (payload.npdes_permit_number && !site.npdes_permit_number) patch.npdes_permit_number = payload.npdes_permit_number;
        if (permitAcres) {
          patch.permitted_acres = permitAcres;
          patch.permitted_acres_basis = payload.acreage_basis;
          patch.permitted_acres_source_url = sourceUrl;
          patch.permitted_acres_last_verified = verifiedAt;
        }
        if (Object.keys(patch).length) {
          await base44.asServiceRole.entities.MiningSite.update(site.id, patch);
          if (permitAcres) siteAcreageUpdated++;
        }

        if (sample.length < 20) sample.push({
          permit: permitNumber,
          permit_type: a.PERMIT_TYPE,
          tdec_site: facilityName,
          mine: site.mine_name,
          msha: site.msha_mine_id || null,
          permittee: payload.permittee_name || null,
          permitted_acres: permitAcres || null,
          match_score: match.score,
          distance_miles: Number.isFinite(match.distance) ? Number(match.distance.toFixed(2)) : null,
        });
      } else {
        ambiguousOrUnmatched++;
      }
    }

    return Response.json({
      success: true,
      source: "TDEC DMGR Mineral and Geologic Permits",
      mode: explicitOffset ? "offset" : "smart statewide queue",
      offset: explicitOffset ? offset : null,
      source_records_available: sourceFeatures.length,
      queried: features.length,
      next_offset: explicitOffset ? offset + features.length : null,
      has_more: explicitOffset ? features.length === limit : sourceFeatures.length > features.length,
      created,
      updated,
      quarry_matches: matched,
      permit_acreage_loaded: acreageLoaded,
      mine_records_with_acreage_updated: siteAcreageUpdated,
      ambiguous_or_unmatched: ambiguousOrUnmatched,
      sample,
      note: "Permit identity, permittee, status, dates and coordinates come from TDEC DMGR. For Mining permits, acreage is additionally read from the public TDEC permit-detail page's Mining Specific table when present. Parcel/tax acreage is never substituted for mining acreage. Mine linkage requires a high-confidence county/name/operator/proximity match; ambiguous links remain unassigned.",
    });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
