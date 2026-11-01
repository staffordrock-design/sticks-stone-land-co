import { base44 } from "@/api/base44Client";

// The public inventory counters are a stored snapshot (PublicInventoryStats),
// so they do not change between page views. Keep one answer for ten minutes and
// share the in-flight request, so the homepage, the trust band and the
// enterprise page never each pay for their own call.
const TTL_MS = 10 * 60 * 1000;

let cached = null;
let cachedAt = 0;
let inflight = null;

export async function loadPublicStats() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await base44.functions.invoke("get-public-stats", {});
      const data = response?.data || response || {};
      cached = data;
      cachedAt = Date.now();
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}