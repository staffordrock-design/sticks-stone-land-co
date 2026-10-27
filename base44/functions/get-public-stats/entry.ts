import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public endpoint: returns the stored inventory counters for the homepage.
// The counters are computed once by compute-public-inventory-stats and read from
// that stored snapshot here, so the numbers are identical on every load instead
// of being recounted from whatever slice of the inventory a query happened to read.
export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);

    const rows = await base44.asServiceRole.entities.PublicInventoryStats.list("-created_date", 1).catch(() => []);
    const stored = (rows || [])[0];

    if (!stored) {
      return Response.json({
        recordCount: 0,
        mappedCount: 0,
        parcelLinkedCount: 0,
        deedLinkedCount: 0,
        enrichedCount: 0,
        statesCovered: [],
        latestRefresh: null,
        sources: [],
      });
    }

    return Response.json({
      recordCount: stored.recordCount ?? 0,
      mappedCount: stored.mappedCount ?? 0,
      parcelLinkedCount: stored.parcelLinkedCount ?? 0,
      deedLinkedCount: stored.deedLinkedCount ?? 0,
      enrichedCount: stored.enrichedCount ?? 0,
      statesCovered: stored.statesCovered || [],
      latestRefresh: stored.latestRefresh || null,
      sources: stored.sources || [],
    });
  } catch (error: any) {
    console.error('get-public-stats error:', error?.message || error);
    return Response.json({
      recordCount: 0,
      mappedCount: 0,
      parcelLinkedCount: 0,
      deedLinkedCount: 0,
      enrichedCount: 0,
      statesCovered: [],
      latestRefresh: null,
      sources: [],
    });
  }
}