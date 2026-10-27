import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { evaluatePremiumEntitlement, PREMIUM_ENTITY_NAMES } from '../../shared/premiumEntitlement.ts';

// Entitlement rules (admin, owner accounts, active subscription, verified Apple
// or Stripe purchase) live in base44/shared/premiumEntitlement.ts so this gate
// and the public quarry list cannot drift apart.

// The one public sample record. Its full premium bundle is served to every
// visitor so anyone can see a complete quarry intelligence record in full.
// Mirrored client-side in src/lib/sampleRecord.js — keep the ID in sync.
const PUBLIC_SAMPLE_SITE_ID = '6a79fe40925c52c762c59a12';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      mining_site_id,
      apple_transactions,
      apple_app_transaction,
      stripe_session_id,
      stripe_browser_session_id,
      operation = 'site',
      entity_name,
      query,
      sort,
      limit,
      skip,
      record_id,
    } = body;

    if (operation === 'site' && !mining_site_id) {
      return Response.json({ error: 'mining_site_id is required' }, { status: 400 });
    }

    // --- Entitlement verification ---
    const user = await base44.auth.me().catch(() => null);
    let entitled = false;

    if (operation === 'site' && String(mining_site_id || '') === PUBLIC_SAMPLE_SITE_ID) {
      // The one public sample record is readable by everyone — no account, no plan.
      entitled = true;
    } else {
      entitled = await evaluatePremiumEntitlement({
        base44,
        user,
        appleTransactions: apple_transactions,
        appleAppTransaction: apple_app_transaction,
        stripeSessionId: stripe_session_id,
        stripeBrowserSessionId: stripe_browser_session_id,
      });
    }

    if (!entitled) {
      return Response.json({ error: 'Subscription required', entitled: false }, { status: 403 });
    }

    // --- Fetch premium data (service role bypasses RLS only after entitlement) ---
    const svc = base44.asServiceRole;

    if (operation === 'entity') {
      const entityName = String(entity_name || '');
      if (!PREMIUM_ENTITY_NAMES.has(entityName)) {
        return Response.json({ error: 'Premium entity is not allowed' }, { status: 400 });
      }
      const entity = svc.entities[entityName];
      if (!entity) return Response.json({ error: 'Premium entity unavailable' }, { status: 404 });
      if (record_id) {
        const record = await entity.get(String(record_id));
        return Response.json({ entitled: true, record: record || null });
      }
      const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
      const safeSkip = Math.max(0, Math.min(Number(skip) || 0, 10000));
      const rows = await entity.filter(
        query && typeof query === 'object' ? query : {},
        String(sort || '-updated_date'),
        safeLimit,
        safeSkip,
      );
      return Response.json({ entitled: true, rows: rows || [] });
    }

    const site = await svc.entities.MiningSite.get(mining_site_id);
    if (!site) {
      return Response.json({ error: 'Mining site not found' }, { status: 404 });
    }

    const siteId = site.id;
    const mshaId = site.msha_mine_id;
    const parcelId = site.parcel_id;
    const tdecPermit = site.tdec_permit_number;
    const npdesPermit = site.npdes_permit_number;

    const linkOr = (extra = []) => {
      const conditions = [{ mining_site_id: siteId }];
      if (mshaId) conditions.push({ msha_mine_id: mshaId });
      conditions.push(...extra.filter(Boolean));
      return { $or: conditions };
    };

    const safeFilter = (entity, query, sort, limit) =>
      svc.entities[entity].filter(query, sort, limit).catch(() => []);

    const [
      parcels, permits, environmental, inspections, violations,
      profiles, production, geology, contracts, usgsOccurrences,
      usgsMarketProduction, tdotProducerPlants, tdotDemand, ownershipVerifications,
    ] = await Promise.all([
      safeFilter('ParcelRecord', linkOr([parcelId ? { parcel_id: parcelId } : null, tdecPermit ? { tdec_permit_number: tdecPermit } : null]), '-updated_date', 50),
      safeFilter('TDECPermit', linkOr([tdecPermit ? { permit_number: tdecPermit } : null]), '-updated_date', 50),
      safeFilter('EnvironmentalRecord', linkOr([npdesPermit ? { npdes_permit_number: npdesPermit } : null]), '-updated_date', 50),
      safeFilter('MSHAInspection', mshaId ? { msha_mine_id: mshaId } : { mining_site_id: siteId }, '-updated_date', 200),
      safeFilter('MSHAViolation', mshaId ? { msha_mine_id: mshaId } : { mining_site_id: siteId }, '-updated_date', 200),
      safeFilter('QuarryPotentialProfile', linkOr(), '-updated_date', 10),
      safeFilter('ProductionRecord', linkOr(), '-year', 200),
      safeFilter('GeologyRecord', linkOr([parcelId ? { parcel_id: parcelId } : null]), '-updated_date', 50),
      safeFilter('ContractIntelligence', linkOr([parcelId ? { parcel_id: parcelId } : null]), '-updated_date', 50),
      safeFilter('USGSMineralOccurrence', linkOr(), '-updated_date', 20),
      safeFilter('USGSMarketProduction', { state: String(site.state || '').toUpperCase() }, '-year', 20),
      safeFilter('TDOTProducerPlant', { $or: [{ matched_mining_site_id: siteId }, { county: site.county, state: 'TN' }] }, '-last_source_update', 50),
      String(site.state || '').toUpperCase() === 'TN' && site.county
        ? safeFilter('TDOTAggregateDemand', { $or: [{ county: site.county }, { counties: site.county }], unit: 'TON' }, '-letting_date', 200)
        : Promise.resolve([]),
      safeFilter('ParcelOwnershipVerification', linkOr([parcelId ? { parcel_id: parcelId } : null]), '-verified_at', 20),
    ]);

    return Response.json({
      entitled: true,
      site,
      parcels: parcels || [],
      permits: permits || [],
      environmental: environmental || [],
      inspections: inspections || [],
      violations: violations || [],
      profiles: profiles || [],
      production: production || [],
      geology: geology || [],
      contracts: contracts || [],
      usgsOccurrences: usgsOccurrences || [],
      usgsMarketProduction: usgsMarketProduction || [],
      tdotProducerPlants: tdotProducerPlants || [],
      tdotDemand: tdotDemand || [],
      ownershipVerifications: ownershipVerifications || [],
    });
  } catch (error) {
    console.error('get-premium-site-data failed', error);
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}