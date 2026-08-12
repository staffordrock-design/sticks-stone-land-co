const TN_PARCEL_QUERY = 'https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0/query';

function boundaryFromGeometry(geom) {
  if (!geom) return [];
  let ring = [];
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) ring = geom.coordinates[0];
  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates?.[0]?.[0])) ring = geom.coordinates[0][0];
  return ring.map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

async function fetchTennesseeParcel(lat, lon) {
  const params = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'GISLINK,GISLINK2,CALC_ACRE,COUNTY_ID,PARCEL_TYPE',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '1',
  });
  const resp = await fetch(`${TN_PARCEL_QUERY}?${params}`);
  if (!resp.ok) throw new Error(`TN Comptroller parcel request failed: ${resp.status}`);
  const data = await resp.json();
  const feature = data?.features?.[0];
  if (!feature) return null;
  const fields = feature.properties || {};
  return {
    source: 'TN Comptroller IMPACT Parcel GIS',
    boundary: boundaryFromGeometry(feature.geometry),
    owner: '',
    parcel_id: fields.GISLINK || fields.GISLINK2 || '',
    legal_description: '',
    assessed_value: null,
    sale_price: null,
    acreage: Number(fields.CALC_ACRE) || null,
    sqft: null,
    zoning: '',
    land_use: '',
    situs_address: '',
    mailing_address: '',
    boundary_source_url: 'https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0',
    county_id: fields.COUNTY_ID ?? null,
    parcel_type: fields.PARCEL_TYPE ?? null,
  };
}

export default async function(req) {
  try {
    const body = await req.json();
    const lat = Number(body?.lat);
    const lon = Number(body?.lng ?? body?.lon);
    const state = String(body?.state || 'TN').toUpperCase();
    if (!isFinite(lat) || !isFinite(lon)) {
      return Response.json({ error: 'valid lat and lng required' }, { status: 400 });
    }

    if (state === 'TN') {
      try {
        const tnParcel = await fetchTennesseeParcel(lat, lon);
        if (tnParcel) return Response.json(tnParcel);
      } catch (error) {
        console.error('TN Comptroller parcel fetch failed:', error);
      }
    }

    return Response.json({ fallback: true, reason: 'no_public_parcel_match', state });
  } catch (error) {
    console.error('fetch-parcel-data error:', error);
    return Response.json({ fallback: true, reason: 'error', error: error.message });
  }
}
