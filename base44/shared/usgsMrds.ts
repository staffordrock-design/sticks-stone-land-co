// Shared utilities for USGS MRDS data processing.
// Used by sync-usgs-mrds and sync-usgs-mrds-southeast backend functions.

export const MRDS_WFS = "https://mrdata.usgs.gov/services/wfs/mrds";
export const MRDS_LAYER = "mrds";
export const MRDS_SOURCE = "USGS Mineral Resources Data System (MRDS)";

export function clean(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
}

export function num(v: unknown): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

export function validCoord(lat: unknown, lon: unknown): boolean {
  const a = Number(lat);
  const o = Number(lon);
  return Number.isFinite(a) && Number.isFinite(o) && a >= -90 && a <= 90 && o >= -180 && o <= 180;
}

// Haversine distance in meters between two lat/lng points.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// Quarry-relevant USGS MRDS commodity codes.
export const QUARRY_CODES = new Set([
  "SDG", "CLY", "STN_C", "LST", "SD", "SIL", "STN", "TLC",
  "CLY_BN", "CLY_K", "CLY_FR", "FLD", "KYN", "GRF", "GYP",
  "DOL", "MAR", "SLT", "GRN", "QRT", "DMS", "TRV", "S_A",
  "CA", "WOL", "PER", "VER", "ZEOL", "PYRO", "OLIV", "MAGN",
  "BLE", "ATM", "BNT", "SILL", "KYA", "FLU", "FLUOR", "BAR",
  "BARYTES", "ASPH", "CEM", "POZZ", "LIME", "CHRT",
]);

const QUARRY_NAME_TERMS = [
  "quarry", "pit", "limestone", "sand", "gravel", "stone", "crush",
  "clay", "shale", "granite", "marble", "slate", "dolomite", "rock",
  "aggregate", "dolomitic", "marl", "chalk", "tripoli", "novaculite",
  "sandstone", "quartzite", "schist", "gneiss", "basalt", "traprock",
];

const EXCLUDE_ONLY_CODES = new Set([
  "FE", "AL", "MN", "AU", "CU", "PB", "ZN", "S", "AS", "CO",
  "SN", "NI", "BA", "MI", "ZR", "P", "TI", "V", "AG", "REE",
  "F", "U", "TH", "W", "MO", "SB", "CR", "BE", "LI", "CS",
  "RB", "NB", "TA", "HF", "RE", "SC", "GA", "GE", "IN", "TE",
  "BR", "I", "CD", "HG", "SE", "PT", "PD", "RH", "RU", "OS",
  "IR", "AU_AG", "FE_PYR", "DIAT", "H2O",
]);

export function isQuarryRelevantByCode(codeList: string, siteName: string): boolean {
  const codes = String(codeList || "").trim().split(/\s+/).filter(Boolean);
  const hasQuarryCode = codes.some((c) => QUARRY_CODES.has(c));
  const hasOnlyExclude = codes.length > 0 && codes.every((c) => EXCLUDE_ONLY_CODES.has(c));
  const name = String(siteName || "").toLowerCase();
  const hasQuarryName = QUARRY_NAME_TERMS.some((t) => name.includes(t));
  return hasQuarryCode || (hasQuarryName && !hasOnlyExclude);
}

// Normalize a mine/site name for fuzzy comparison.
export function normalizeName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(quarry|pit|mine|plant|crusher|no\.|#|inc|llc|co|corp|company|the)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Check if two normalized names are a strong match.
export function nameMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Only use substring match when the shorter name is substantial (>= 4 chars)
  // to prevent "a" or "co" from matching everything.
  if (na.length >= 4 && nb.length >= 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  // Word-based match: all significant words in the shorter name must appear in the longer.
  const wa = na.split(" ").filter((w) => w.length > 2);
  const wb = nb.split(" ").filter((w) => w.length > 2);
  if (wa.length >= 2 && wb.length >= 2) {
    const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    return shorter.every((w) => longer.includes(w));
  }
  return false;
}

// Parse GML features from WFS response into { properties, coordinates } objects.
export function parseGmlFeatures(xml: string): { properties: Record<string, string>; coordinates: [number, number] | null }[] {
  const members = [...xml.matchAll(/<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g)];
  return members.map((m) => {
    const block = m[1];
    const props: Record<string, string> = {};
    const propMatches = [...block.matchAll(/<ms:(\w+)>([^<]*)<\/ms:\w+>/g)];
    for (const pm of propMatches) {
      props[pm[1]] = pm[2].trim();
    }
    const pointMatch = block.match(/<gml:Point[^>]*>\s*<gml:coordinates>([^<]+)<\/gml:coordinates>\s*<\/gml:Point>/);
    let coordinates: [number, number] | null = null;
    if (pointMatch) {
      const parts = pointMatch[1].trim().split(/[,\s]+/);
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) coordinates = [lon, lat];
    }
    return { properties: props, coordinates };
  });
}

// Build a spatial grid index for fast proximity lookups.
export function buildGrid(sites: any[], cellSizeDeg = 0.01) {
  const grid = new Map<string, any[]>();
  for (const s of sites) {
    if (!validCoord(s.latitude, s.longitude)) continue;
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    const key = `${Math.floor(lat / cellSizeDeg)},${Math.floor(lng / cellSizeDeg)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(s);
  }
  return { grid, cellSizeDeg };
}

// Find the nearest MiningSite within maxMeters using the grid.
export function findNearestSite(lat: number, lng: number, gridData: ReturnType<typeof buildGrid>, maxMeters: number) {
  const { grid, cellSizeDeg } = gridData;
  const cellLat = Math.floor(lat / cellSizeDeg);
  const cellLng = Math.floor(lng / cellSizeDeg);
  let best: { site: any; dist: number } | null = null;
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const key = `${cellLat + dLat},${cellLng + dLng}`;
      const cell = grid.get(key);
      if (!cell) continue;
      for (const site of cell) {
        const dist = haversineMeters(lat, lng, Number(site.latitude), Number(site.longitude));
        if (dist <= maxMeters && (!best || dist < best.dist)) {
          best = { site, dist };
        }
      }
    }
  }
  return best;
}

// Find a MiningSite by name match.
export function findByNameMatch(name: string, sites: any[]): any | null {
  for (const s of sites) {
    if (nameMatch(name, s.mine_name)) return s;
  }
  return null;
}