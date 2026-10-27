import { secrets } from 'base44:runtime';
import { verifyApplePurchases } from './appleVerify.ts';
import { isOwnerUser } from './ownerAccess.ts';

// ---------------------------------------------------------------------------
// Shared premium entitlement decision.
//
// Used by both backend paths that serve premium quarry intelligence:
//   - get-premium-site-data  (full record bundle / entity reads)
//   - get-public-quarry-list (stored screening values on the home list)
//
// Entitlement is recognised for:
//   1. Admin users
//   2. Owner accounts (base44/shared/ownerAccess.ts)
//   3. Signed-in users with an active SubscriptionEntitlement
//   4. Anonymous Apple StoreKit purchasers (verified transaction JWS)
//   5. Anonymous web Stripe purchasers (verified checkout session)
// ---------------------------------------------------------------------------

export const FULL_QUARRY_PLANS = new Set(['professional_monthly', 'marketplace_monthly']);
export const ACTIVE_STATUSES = new Set(['active', 'grace_period']);
export const FULL_APPLE_PRODUCTS = new Set([
  'com.ssrockholdings.marketplace.monthly',
  'com.ssrockholdings.mobile.quarryintelligence.monthly199',
  'com.ssrockholdings.professional.monthly',
]);

export const PREMIUM_ENTITY_NAMES = new Set([
  'MiningSite', 'ParcelRecord', 'GeologyRecord', 'TDECPermit', 'EnvironmentalRecord',
  'ProductionRecord', 'MSHAInspection', 'MSHAViolation', 'QuarryPotentialProfile',
  'ContractIntelligence', 'ValuationRecord', 'USGSMineralOccurrence',
  'ParcelOwnershipVerification',
]);

export function isEntitledEntitlement(row: any) {
  if (!row || !FULL_QUARRY_PLANS.has(row.plan_code) || !ACTIVE_STATUSES.has(row.status)) return false;
  if (!row.expires_at) return true;
  const expiresAt = Date.parse(row.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function checkSignedInUser(base44: any, user: any) {
  if (user?.role === 'admin' || isOwnerUser(user)) return true;
  if (!user?.id) return false;
  try {
    const rows = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, '-updated_date', 20);
    return (rows || []).some(isEntitledEntitlement);
  } catch {
    return false;
  }
}

export async function appleTransactionsActive(jwsList: any, signedAppTransaction: any, expectedUserId: any) {
  if (!Array.isArray(jwsList) || !jwsList.length) return false;
  try {
    const { verified } = await verifyApplePurchases({
      signedTransactions: jwsList.filter((v: any) => typeof v === 'string' && v.length > 50).slice(0, 20),
      signedAppTransaction: typeof signedAppTransaction === 'string' ? signedAppTransaction : '',
      expectedUserId: expectedUserId || undefined,
    });
    return (verified || []).some(({ transaction, productId }: any) => {
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

export async function stripeSessionActive(sessionId: any, browserSessionId: any) {
  if (!sessionId || !browserSessionId) return false;
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
    if (String(session?.metadata?.checkout_flow || '') !== 'anonymous_web') return false;
    if (String(session?.metadata?.browser_session_id || '') !== String(browserSessionId)) return false;
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
    const planCode = String(sub?.metadata?.plan_code || session?.metadata?.plan_code || '');
    if (!FULL_QUARRY_PLANS.has(planCode)) return false;
    return sub.status === 'active' || sub.status === 'past_due';
  } catch {
    return false;
  }
}

export async function evaluatePremiumEntitlement({
  base44,
  user,
  appleTransactions,
  appleAppTransaction,
  stripeSessionId,
  stripeBrowserSessionId,
}: any) {
  if (user?.role === 'admin' || isOwnerUser(user)) return true;
  if (await checkSignedInUser(base44, user)) return true;
  if (await appleTransactionsActive(appleTransactions, appleAppTransaction, user?.id)) return true;
  if (await stripeSessionActive(stripeSessionId, stripeBrowserSessionId)) return true;
  return false;
}