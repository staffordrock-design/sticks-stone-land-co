import { createClientFromRequest } from "npm:@base44/sdk";

const PARCEL_SERVICE = "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0/query";
const ASSESSMENT_SERVICE = "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcel_Layer_Labels/FeatureServer/1/query";
const ASSESSMENT_SOURCE_URL = "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcel_Layer_Labels/FeatureServer/1";

function ringToLatLng(ring: number[][]) {
  return (ring || [])
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function isPriorityStatus(status: unknown) {
  const value = String(status || "").toLowerCase();
  return value.includes("new mine") || value.includes("potential") || value.includes("intermittent") || value.includes("temporarily idled") || value.includes("nonproducing") || value.includes("non-producing") || value.includes("inactive") || value.includes("historical") || value.includes("abandon");
}

function isQuarryRelevant(site: any) {
  const commodity = String(site?.commodity || "").toLowerCase().trim();
  if (commodity.includes("coal")) return false;
  if (!commodity) return true;
  return ["stone", "limestone", "sand", "gravel", "aggregate", "marble", "granite", "slate", "shale", "quartz", "clay", "dolomite", "rock", "lime"]
    .some((term) => commodity.includes(term));
}

function validTennesseeCoordinates(lat: unknown, lng: unknown) {
  const y = Number(lat);
  const x = Number(lng);
  return Number.isFinite(y) && Number.isFinite(x) && y >= 34.8 && y <= 36.8 && x >= -90.5 && x <= -81.5;
}

function daysSince(value: unknown) {
  const t = new Date(String(value || "")).getTime();
  return Number.isFinite(t) ? (Date.now() - t) / 86400000 : Infinity;
}

function shouldRetryVerification(v: any) {
  if (!v) return true;
  const age = daysSince(v.verified_at);
  if (v.status === "Verified") return false;
  if (v.status === "No Coordinates") return age >= 7;
  if (v.status === "No Parcel Match" || v.status === "Parcel Matched - No Owner") return age >= 30;
  return true;
}

async function saveVerification(base44: any, site: any, status: string, details: any = {}, existing?: any) {
  const payload = {
    mining_site_id: site.id,
    msha_mine_id: site.msha_mine_id || undefined,
    parcel_id: details.parcelId || site.parcel_id || undefined,
    status,
    owner_name: details.owner || undefined,
    owner_name_2: details.owner2 || undefined,
    tax_year: Number(details.taxYear) || undefined,
    property_address: details.propertyAddress || undefined,
    mailing_address: details.mailingAddress || undefined,
    deed_book_page: details.deedBookPage || undefined,
    source_updated: details.sourceUpdated || undefined,
    verified_at: new Date().toISOString(),
    source_url: details.sourceUrl || ASSESSMENT_SOURCE_URL,
  };
  if (existing?.id) return await base44.asServiceRole.entities.ParcelOwnershipVerification.update(existing.id, payload);
  return await base44.asServiceRole.entities.ParcelOwnershipVerification.create(payload);
}

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Parcel service ${response.status}`);
  return await response.json();
}

async function lookupParcel(lat: number, lng: number) {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "GISLINK,GISLINK2,CALC_ACRE,COUNTY_ID,PARCEL_TYPE",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "1",
  });
  const data = await fetchJson(`${PARCEL_SERVICE}?${params.toString()}`);
  const feature = data?.features?.[0];
  if (!feature) return null;

  const props = feature.properties || {};
  const geometry = feature.geometry || {};
  let ring: number[][] = [];
  if (geometry.type === "Polygon") ring = geometry.coordinates?.[0] || [];
  if (geometry.type === "MultiPolygon") ring = geometry.coordinates?.[0]?.[0] || [];
  const boundary_polygon = ringToLatLng(ring);

  const parcelId = String(props.GISLINK || props.GISLINK2 || "").trim();
  let assessment: any = null;
  if (parcelId) {
    try {
      const escaped = parcelId.replace(/'/g, "''");
      const ap = new URLSearchParams({
        f: "json",
        where: `GISLINK='${escaped}'`,
        outFields: "GISLINK,PARCELID,OWNER,OWNER2,OWNJAN1,ADDRESS,MAILADDR,MAILCITY,STATE,ZIP,CALC_ACRE,LANDVAL,IMPVAL,APPRAISAL,DEEDBKPG,TAXYR,UPDATED,LASTUPD,COUNTY",
        returnGeometry: "false",
        resultRecordCount: "1",
      });
      const ad = await fetchJson(`${ASSESSMENT_SERVICE}?${ap.toString()}`);
      assessment = ad?.features?.[0]?.attributes || null;
    } catch { /* assessment is best-effort */ }
  }

  return { props, boundary_polygon, parcelId, assessment };
}

async function processSite(base44: any, site: any, verification?: any) {
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);
  if (!validTennesseeCoordinates(lat, lng)) {
    await saveVerification(base44, site, "No Coordinates", {}, verification);
    return { status: "no_coordinates" };
  }

  try {
    const result = await lookupParcel(lat, lng);
    if (!result || result.boundary_polygon.length < 3) {
      await saveVerification(base44, site, "No Parcel Match", {}, verification);
      return { status: "no_match" };
    }

    const { props, boundary_polygon, parcelId, assessment } = result;
    const ownerName = String(assessment?.OWNER || assessment?.OWNJAN1 || "").trim() || undefined;
    const mailingAddress = [assessment?.MAILADDR, assessment?.MAILCITY, assessment?.STATE, assessment?.ZIP]
      .map((v) => String(v || "").trim()).filter(Boolean).join(", ") || undefined;
    const assessmentSourceUrl = parcelId ? `${ASSESSMENT_SOURCE_URL}?parcel=${encodeURIComponent(parcelId)}` : ASSESSMENT_SOURCE_URL;

    const existing = await base44.asServiceRole.entities.ParcelRecord.filter(
      parcelId ? { parcel_id: parcelId } : { msha_mine_id: site.msha_mine_id || "__none__" },
      "-updated_date", 1
    );

    const payload = {
      state: "TN",
      county: site.county || existing?.[0]?.county || "Unknown",
      parcel_id: parcelId || existing?.[0]?.parcel_id || `TN-${site.id}`,
      owner_name: ownerName || existing?.[0]?.owner_name || site.parcel_owner || undefined,
      property_address: String(assessment?.ADDRESS || "").trim() || existing?.[0]?.property_address || undefined,
      mailing_address: mailingAddress || existing?.[0]?.mailing_address || undefined,
      acreage: Number(assessment?.CALC_ACRE) || Number(props.CALC_ACRE) || existing?.[0]?.acreage || site.acreage || undefined,
      assessed_value: Number(assessment?.APPRAISAL) || existing?.[0]?.assessed_value || undefined,
      land_value: Number(assessment?.LANDVAL) || existing?.[0]?.land_value || undefined,
      improvement_value: Number(assessment?.IMPVAL) || existing?.[0]?.improvement_value || undefined,
      latitude: lat,
      longitude: lng,
      boundary_polygon,
      boundary_source: "TN Comptroller IMPACT Parcel Feature Service",
      boundary_source_url: "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0",
      boundary_last_verified: new Date().toISOString(),
      msha_mine_id: site.msha_mine_id || existing?.[0]?.msha_mine_id || undefined,
      tdec_permit_number: site.tdec_permit_number || existing?.[0]?.tdec_permit_number || undefined,
      deed_book_page: String(assessment?.DEEDBKPG || "").trim() || existing?.[0]?.deed_book_page || undefined,
      source_name: assessment ? "TN Comptroller IMPACT Property Assessment GIS" : (existing?.[0]?.source_name || "TN Comptroller Parcel GIS"),
      source_url: assessment ? assessmentSourceUrl : (existing?.[0]?.source_url || "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0"),
      last_source_update: String(assessment?.UPDATED || assessment?.LASTUPD || "").trim() || new Date().toISOString(),
    };

    if (existing?.[0]?.id) {
      await base44.asServiceRole.entities.ParcelRecord.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.ParcelRecord.create(payload);
    }

    // Update the MiningSite with parcel_id and owner.
    const siteUpdates: any = {};
    if (parcelId && parcelId !== site.parcel_id) siteUpdates.parcel_id = parcelId;
    if (ownerName && ownerName !== site.parcel_owner) siteUpdates.parcel_owner = ownerName;
    if (payload.acreage && payload.acreage !== site.acreage) siteUpdates.acreage = payload.acreage;
    if (Object.keys(siteUpdates).length) await base44.asServiceRole.entities.MiningSite.update(site.id, siteUpdates);

    await saveVerification(base44, site, ownerName ? "Verified" : "Parcel Matched - No Owner", {
      parcelId,
      owner: ownerName,
      owner2: String(assessment?.OWNER2 || "").trim() || undefined,
      taxYear: assessment?.TAXYR,
      propertyAddress: payload.property_address,
      mailingAddress: payload.mailing_address,
      deedBookPage: payload.deed_book_page,
      sourceUpdated: payload.last_source_update,
      sourceUrl: payload.source_url,
    }, verification);

    return { status: ownerName ? "matched_with_owner" : "matched_no_owner", parcelId, owner: ownerName };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit || 25), 1), 40);
    const concurrency = Math.min(Math.max(Number(body?.concurrency || 2), 1), 3);
    const startedAt = Date.now();
    const TIME_BUDGET_MS = 240000; // 4 min budget, leaving 60s buffer under the 5 min function limit

    // Load TN sites — stop early once we have enough quarry-relevant candidates without owners.
    const allSites: any[] = [];
    const candidateSites: any[] = [];
    for (let skip = 0; skip < 5000 && candidateSites.length < limit * 4; skip += 500) {
      const batch = await base44.asServiceRole.entities.MiningSite.filter({ state: "TN" }, "-updated_date", 500, skip);
      allSites.push(...(batch || []));
      for (const s of batch || []) {
        if (isQuarryRelevant(s) && (!s.parcel_owner || !String(s.parcel_owner).trim())) candidateSites.push(s);
      }
      if (!batch || batch.length < 500) break;
    }

    // Load only the verification records for candidate sites (not all 10000+).
    // Bulk-filter by mining_site_id in batches to avoid loading the entire table.
    const candidateIds = candidateSites.map((s) => s.id);
    const verificationBySite = new Map<string, any>();
    for (let i = 0; i < candidateIds.length; i += 50) {
      const chunk = candidateIds.slice(i, i + 50);
      const orConditions = chunk.map((id) => ({ mining_site_id: id }));
      const rows = await base44.asServiceRole.entities.ParcelOwnershipVerification.filter({ $or: orConditions }, "-verified_at", 50);
      for (const v of rows || []) if (v.mining_site_id && !verificationBySite.has(v.mining_site_id)) verificationBySite.set(v.mining_site_id, v);
    }

    // Focus parcel-owner work on quarry/aggregate records, not coal, and suppress recent
    // failures. Invalid MSHA coordinates are recorded once and revisited later rather than
    // consuming every scheduled batch.
    const candidates = candidateSites
      .filter((s) => shouldRetryVerification(verificationBySite.get(s.id)))
      .sort((a, b) => {
        const priority = Number(isPriorityStatus(b.mine_status)) - Number(isPriorityStatus(a.mine_status));
        if (priority) return priority;
        return Number(validTennesseeCoordinates(b.latitude, b.longitude)) - Number(validTennesseeCoordinates(a.latitude, a.longitude));
      })
      .slice(0, limit);

    let matched = 0, matchedWithOwner = 0, noMatch = 0, noCoordinates = 0, errors = 0;
    const errorDetails: string[] = [];
    let processed = 0;
    let consecutiveTimeouts = 0;
    let circuitBroken = false;

    // Process in concurrent batches, respecting a global time budget.
    // Circuit breaker: if 4 consecutive sites time out, the API is down — abort early.
    for (let i = 0; i < candidates.length; i += concurrency) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      if (circuitBroken) break;
      const batch = candidates.slice(i, i + concurrency);
      const results = await Promise.all(batch.map((site) => processSite(base44, site, verificationBySite.get(site.id))));
      for (const r of results) {
        processed++;
        if (r.status === "matched_with_owner") { matched++; matchedWithOwner++; consecutiveTimeouts = 0; }
        else if (r.status === "matched_no_owner") { matched++; consecutiveTimeouts = 0; }
        else if (r.status === "no_match") { noMatch++; consecutiveTimeouts = 0; }
        else if (r.status === "no_coordinates") { noCoordinates++; consecutiveTimeouts = 0; }
        else {
          errors++;
          if (errorDetails.length < 10) errorDetails.push(r.error || "unknown");
          if (r.error && r.error.includes("timeout")) {
            consecutiveTimeouts++;
            if (consecutiveTimeouts >= 4) { circuitBroken = true; break; }
          }
        }
      }
    }

    return Response.json({
      success: true,
      source: "TN Comptroller IMPACT Parcels + Assessment GIS",
      total_sites: allSites.length,
      candidates: candidates.length,
      queried: candidates.length,
      processed,
      matched,
      matched_with_owner: matchedWithOwner,
      no_match: noMatch,
      no_coordinates: noCoordinates,
      errors,
      error_details: errorDetails,
      circuit_broken: circuitBroken,
      verification_records_loaded: verificationBySite.size,
      elapsed_ms: Date.now() - startedAt,
      note: "Owner names sourced from TN Comptroller IMPACT Property Assessment GIS. Coal records are excluded from quarry-owner enrichment, invalid coordinates are quarantined, and recent no-match attempts are suppressed so scheduled runs continue statewide. A circuit breaker aborts early when the TN Comptroller API is consistently timing out. Boundaries are GIS reference geometry, not legal surveys.",
    });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});