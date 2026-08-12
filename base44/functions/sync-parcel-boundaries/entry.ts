import { createClientFromRequest } from "npm:@base44/sdk";

const PARCEL_SERVICE = "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0/query";

function ringToLatLng(ring: number[][]) {
  return (ring || [])
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit || 100), 1), 500);
    const sites = await base44.asServiceRole.entities.MiningSite.list("-updated_date", limit);

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
        const response = await fetch(`${PARCEL_SERVICE}?${params.toString()}`);
        if (!response.ok) throw new Error(`Parcel service ${response.status}`);
        const data = await response.json();
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
        const existing = await base44.asServiceRole.entities.ParcelRecord.filter(
          parcelId ? { parcel_id: parcelId } : { msha_mine_id: site.msha_mine_id || "__none__" },
          "-updated_date",
          1
        );

        const payload = {
          state: "TN",
          county: site.county || existing?.[0]?.county || "Unknown",
          parcel_id: parcelId || existing?.[0]?.parcel_id || `TN-${site.id}`,
          owner_name: existing?.[0]?.owner_name || site.parcel_owner || undefined,
          property_address: existing?.[0]?.property_address || undefined,
          mailing_address: existing?.[0]?.mailing_address || undefined,
          acreage: Number(props.CALC_ACRE) || existing?.[0]?.acreage || site.acreage || undefined,
          assessed_value: existing?.[0]?.assessed_value || undefined,
          land_value: existing?.[0]?.land_value || undefined,
          improvement_value: existing?.[0]?.improvement_value || undefined,
          latitude: lat,
          longitude: lng,
          boundary_polygon,
          boundary_source: "TN Comptroller IMPACT Parcel Feature Service",
          boundary_source_url: "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0",
          boundary_last_verified: new Date().toISOString(),
          msha_mine_id: site.msha_mine_id || existing?.[0]?.msha_mine_id || undefined,
          tdec_permit_number: site.tdec_permit_number || existing?.[0]?.tdec_permit_number || undefined,
          deed_book_page: existing?.[0]?.deed_book_page || undefined,
          source_name: existing?.[0]?.source_name || "TN Comptroller Parcel GIS",
          source_url: existing?.[0]?.source_url || undefined,
          last_source_update: new Date().toISOString(),
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
      note: "Boundaries are GIS reference geometry and are not legal surveys or legal boundary determinations.",
    });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
