import { base44 } from "@/api/base44Client";

// Short-lived cache for the public quarry inventory. The eight-state set is the
// single most expensive request the map pages make (~3,000 records), so moving
// between home and the map should not pay for it twice.
const TTL_MS = 60 * 1000;
const cache = new Map();
const inflight = new Map();

export async function loadPublicQuarryList(state, proof = null) {
  // Entitled and unentitled responses differ (stored screening fields are only
  // present for an entitled caller), so they never share a cache entry.
  const variant = proof && Object.keys(proof).length ? "proof" : "public";
  const key = `${state}|${variant}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sites;
  if (inflight.has(key)) return inflight.get(key);

  const request = (async () => {
    const response = await base44.functions.invoke("get-public-quarry-list", {
      state,
      ...(proof || {}),
    });
    const rows = response?.data?.sites || response?.sites || [];
    const sites = Array.isArray(rows) ? rows : [];
    cache.set(key, { at: Date.now(), sites });
    return sites;
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}