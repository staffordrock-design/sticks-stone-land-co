import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { verifyApplePurchases } from '../../shared/appleVerify.ts';

// ---------------------------------------------------------------------------
// Server-side entitlement gate for premium quarry intelligence data.
//
// Premium entities (Parcel, Geology, Permits, Environmental, MSHA, Production,
// Profiles, Contracts, Valuation, USGS occurrences) are locked to admin-only
// RLS. This function is the sole legitimate read path for paid subscribers.
//
// Entitlement is recognised for:
//   1. Admin users
//   2. Signed-in users with an active SubscriptionEntitlement
//   3. Anonymous Apple StoreKit purchasers (verified transaction JWS)
//   4. Anonymous web Stripe purchasers (verified checkout session)
// ---------------------------------------------------------------------------

const FULL_QUARRY_PLANS = new Set(['professional_monthly', 'marketplace_monthly']);
const ACTIVE_STATUSES = new Set(['active', 'grace_period']);
const FULL_APPLE_PRODUCTS = new Set([
  'com.ssrockholdings.marketplace.monthly',
  'com.ssrockholdings.mobile.quarryintelligence.monthly199',
  'com.ssrockholdings.quarryintelligence.monthly199',
  'com.ssrockholdings.professional.monthly',
]);

function isEntitledEntitlement(row) {
  if (!row) return false;
  return FULL_QUARRY_PLANS.has(row.plan_code) && ACTIVE_STATUSES.has(row.status);
}

async function checkSignedInUser(base44, user) {
  if (user?.role === 'admin') return true;
  if (!user?.id) return false;
  try {
    const rows = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, '-updated_date', 20);
    return (rows || []).some(isEntitledEntitlement);
  } catch {
    return false;
  }
}

async function appleTransactionsActive(jwsList, signedAppTransaction, expectedUserId) {
  if (!Array.isArray(jwsList) || !jwsList.length) return false;
  try {
    const { verified } = await verifyApplePurchases({
      signedTransactions: jwsList.filter((v) => typeof v === 'string' && v.length > 50).slice(0, 20),
      signedAppTransaction: typeof signedAppTransaction === 'string' ? signedAppTransaction : '',
      expectedUserId: expectedUserId || undefined,
    });
    return (verified || []).some(({ transaction, productId }) => {
      if (!FULL_APPLE_PRODUCTS.has(String(productId || ''))) return false;
      if (transaction?.revocationDate) return false;
      const expiresMs = Number(transaction?.expiresDate || 0);
      if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) return false;
      const discount = String(transaction?.offerDiscountType || '').toUpperCase();
      const price = Number(transaction?.price);
      const freeTrial = discount === 'FREE_TRIAL' || (Number(transaction?.offerType) === 1 && price === 0);
      return !freeTrial;
    });
  } catch {
    return false;
  }
}

async function stripeSessionActive(sessionId) {
  if (!sessionId) return false;
  const key = secrets.get('STRIPE_SECRET_KEY');
  if (!key) return false;
  try {
    const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': '2025-10-29.clover',
      },
    });
    if (!resp.ok) return false;
    const session = await resp.json();
    if (session.payment_status !== 'paid') return false;
    if (!session.subscription) return false;
    const subResp = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(session.subscription)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': '2025-10-29.clover',
      },
    });
    if (!subResp.ok) return false;
    const sub = await subResp.json();
    return sub.status === 'active' || sub.status === 'trialing';
  } catch {
    return false;
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { mining_site_id, apple_transactions, stripe_session_id } = body;

    if (!mining_site_id) {
      return Response.json({ error: 'mining_site_id is required' }, { status: 400 });
    }

    // --- Entitlement verification ---
    const user = await base44.auth.me().catch(() => null);
    let entitled = false;

    if (user?.role === 'admin') {
      entitled = true;
    } else if (user?.id) {
      entitled = await checkSignedInUser(base44, user);
    }

    // Anonymous Apple StoreKit
    if (!entitled && Array.isArray(apple_transactions)) {
      entitled = apple_transactions.some((jws) => appleTransactionActive(jws));
    }

    // Anonymous web Stripe
    if (!entitled && stripe_session_id) {
      entitled = await stripeSessionActive(stripe_session_id);
    }

    if (!entitled) {
      return Response.json({ error: 'Subscription required', entitled: false }, { status: 403 });
    }

    // --- Fetch premium data (service role bypasses RLS) ---
    const svc = base44.asServiceRole;
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
      usgsMarketProduction, tdotProducerPlants, tdotDemand,
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
    ]);

    return Response.json({
      entitled: true,
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
    });
  } catch (error) {
    console.error('get-premium-site-data failed', error);
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}