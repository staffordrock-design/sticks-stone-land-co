import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const body = await req.json();
    const lat = Number(body?.lat);
    const lon = Number(body?.lng ?? body?.lon);
    if (!isFinite(lat) || !isFinite(lon)) {
      return Response.json({ error: 'valid lat and lng required' }, { status: 400 });
    }

    const token = secrets.get('REGIRD_API_KEY');
    if (!token) {
      return Response.json({ fallback: true, reason: 'no_key' });
    }

    const url =
      `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lon}` +
      `&radius=30&limit=1&token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      console.error('Regrid fetch failed:', resp.status, await resp.text());
      return Response.json({ fallback: true, reason: 'request_failed', status: resp.status });
    }

    const data = await resp.json();
    const feature = data?.parcels?.features?.[0];
    if (!feature) {
      return Response.json({ fallback: true, reason: 'no_parcel' });
    }

    let boundary = [];
    const geom = feature.geometry;
    if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
      boundary = geom.coordinates[0].map(([lo, la]) => ({ lat: la, lng: lo }));
    } else if (geom?.type === 'MultiPolygon' && Array.isArray(geom.coordinates?.[0]?.[0])) {
      boundary = geom.coordinates[0][0].map(([lo, la]) => ({ lat: la, lng: lo }));
    }

    const f = feature.properties?.fields || {};
    const zoningText = [f.zoning, f.zoning_description].filter(Boolean).join(' — ');
    const situs = [f.address, f.scity || f.city, f.state2, f.szip5 || f.szip]
      .filter(Boolean).join(', ');
    const mail = [f.mailadd, f.mail_city, f.mail_state2, f.mail_zip]
      .filter(Boolean).join(', ');

    return Response.json({
      source: 'Regrid',
      boundary,
      owner: f.owner || '',
      parcel_id: f.parcelnumb || f.parcelnumb_no_formatting || feature.properties?.path || '',
      legal_description: f.legaldesc || '',
      assessed_value: typeof f.parval === 'number' ? f.parval : null,
      sale_price: typeof f.saleprice === 'number' ? f.saleprice : null,
      acreage:
        typeof f.gisacre === 'number' ? f.gisacre :
        typeof f.ll_gisacre === 'number' ? f.ll_gisacre : null,
      sqft:
        typeof f.sqft === 'number' ? f.sqft :
        typeof f.ll_gissqft === 'number' ? f.ll_gissqft : null,
      zoning: zoningText,
      land_use: f.usedesc || '',
      situs_address: situs,
      mailing_address: mail,
      ll_uuid: f.ll_uuid || '',
      path: feature.properties?.path || f.path || '',
    });
  } catch (error) {
    console.error('fetch-parcel-data error:', error);
    return Response.json({ fallback: true, reason: 'error', error: error.message });
  }
}