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
  return value.includes("intermittent") || value.includes("temporarily idled") || value.includes("nonproducing") || value.includes("non-producing") || value.includes("inactive") || value.includes("historical") || value.includes("abandon");
}

async function fetchParcel(url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Parcel service ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit || 100), 1), 500);
    const allSites = await base44.asServiceRole.entities.MiningSite.list("-updated_date", 500);
    const sites = (allSites || [])
      .filter((site: any) => String(site.state || "").toUpperCase() === "TN")
      .sort((a: any, b: any) => Number(isPriorityStatus(b.mine_status)) - Number(isPriorityStatus(a.mine_status)))
      .slice(0, limit);

    let queried = 0;
    let matched = 0;
    let updated = 0;
    let created = 0;
    let noCoordinates = 0;
    let noMatch = 0;
    const errors: Array<{ site_id: string; error: string }> = [];

    for (const site of sites || []) {
      const lat = Number(site.latitude);
      const lng = Number(site.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        noCoordinates++;
        continue;
      }

      queried++;
      try {
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
        const data = await fetchParcel(`${PARCEL_SERVICE}?${params.toString()}`);
        const feature = data?.features?.[0];
        if (!feature) {
          noMatch++;
          continue;
        }
        matched++;

        const props = feature.properties || {};
        const geometry = feature.geometry || {};
        let ring: number[][] = [];
        if (geometry.type === "Polygon") ring = geometry.coordinates?.[0] || [];
        if (geometry.type === "MultiPolygon") ring = geometry.coordinates?.[0]?.[0] || [];
        const boundary_polygon = ringToLatLng(ring);
        if (boundary_polygon.length < 3) {
          noMatch++;
          continue;
        }

        const parcelId = String(props.GISLINK || props.GISLINK2 || site.parcel_id || "").trim();

        // Once the mine coordinate is matched to an official Tennessee parcel GISLINK,
        // fetch the public assessment record by GISLINK so title-owner information is
        // sourced from assessor data rather than being inferred from the mine operator.
        let assessment: any = null;
        if (parcelId) {
          try {
            const escaped = parcelId.replace(/'/g, "''");
            const assessmentParams = new URLSearchParams({
              f: "json",
              where: `GISLINK='${escaped}'`,
              outFields: "GISLINK,PARCELID,OWNER,OWNER2,OWNJAN1,ADDRESS,MAILADDR,MAILCITY,STATE,ZIP,CALC_ACRE,LANDVAL,IMPVAL,APPRAISAL,DEEDBKPG,TAXYR,UPDATED,LASTUPD,COUNTY",
              returnGeometry: "false",
              resultRecordCount: "1",
            });
            const assessmentData = await fetchParcel(`${ASSESSMENT_SERVICE}?${assessmentParams.toString()}`);
            assessment = assessmentData?.features?.[0]?.attributes || null;
          } catch (error) {
            errors.push({ site_id: site.id, error: `Assessment lookup: ${error instanceof Error ? error.message : String(error)}` });
          }
        }

        const ownerName = String(assessment?.OWNER || assessment?.OWNJAN1 || "").trim() || undefined;
        const mailingAddress = [assessment?.MAILADDR, assessment?.MAILCITY, assessment?.STATE, assessment?.ZIP]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join(", ") || undefined;
        const assessmentSourceUrl = parcelId
          ? `${ASSESSMENT_SOURCE_URL}?parcel=${encodeURIComponent(parcelId)}`
          : ASSESSMENT_SOURCE_URL;

        const existing = await base44.asServiceRole.entities.ParcelRecord.filter(
          parcelId ? { parcel_id: parcelId } : { msha_mine_id: site.msha_mine_id || "__none__" },
          "-updated_date",
          1
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
          updated++;
        } else {
          await base44.asServiceRole.entities.ParcelRecord.create(payload);
          created++;
        }

        if (parcelId && parcelId !== site.parcel_id) {
          await base44.asServiceRole.entities.MiningSite.update(site.id, {
            parcel_id: parcelId,
            acreage: payload.acreage || site.acreage,
            parcel_owner: payload.owner_name || site.parcel_owner,
          });
        } else if (ownerName && ownerName !== site.parcel_owner) {
          await base44.asServiceRole.entities.MiningSite.update(site.id, {
            parcel_owner: ownerName,
            acreage: payload.acreage || site.acreage,
          });
        }
      } catch (error) {
        errors.push({ site_id: site.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return Response.json({
      success: true,
      source: "TN Comptroller IMPACT Parcels",
      queried,
      matched,
      updated,
      created,
      no_coordinates: noCoordinates,
      no_match: noMatch,
      errors: errors.slice(0, 25),
      note: "Parcel IDs/boundaries come from Tennessee Comptroller IMPACT GIS. Owner names and assessment fields are populated from the official IMPACT Property Assessment GIS when available. Boundaries are GIS reference geometry and are not legal surveys or legal boundary determinations.",
    });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
