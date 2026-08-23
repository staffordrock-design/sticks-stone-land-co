const STATE_BOUNDS = {
  TN: { minLat: 34.8, maxLat: 36.8, minLng: -90.5, maxLng: -81.5 },
  GA: { minLat: 30.2, maxLat: 35.2, minLng: -85.8, maxLng: -80.6 },
  AL: { minLat: 30.1, maxLat: 35.2, minLng: -88.7, maxLng: -84.7 },
  KY: { minLat: 36.3, maxLat: 39.3, minLng: -89.8, maxLng: -81.8 },
  NC: { minLat: 33.7, maxLat: 36.8, minLng: -84.5, maxLng: -75.2 },
  SC: { minLat: 31.9, maxLat: 35.3, minLng: -83.5, maxLng: -78.3 },
  FL: { minLat: 24.2, maxLat: 31.2, minLng: -87.8, maxLng: -79.7 },
  MS: { minLat: 30.0, maxLat: 35.2, minLng: -91.8, maxLng: -87.9 },
};

export function isValidCoordinate(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
}

export function isPlausibleSoutheastCoordinate(lat, lng, state) {
  if (!isValidCoordinate(lat, lng)) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  const code = String(state || "").trim().toUpperCase();
  const bounds = STATE_BOUNDS[code];
  if (bounds) {
    return nLat >= bounds.minLat && nLat <= bounds.maxLat && nLng >= bounds.minLng && nLng <= bounds.maxLng;
  }
  return nLat >= 24.0 && nLat <= 39.5 && nLng >= -92.0 && nLng <= -75.0;
}
