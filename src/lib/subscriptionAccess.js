import { base44 } from "@/api/base44Client";
import { isNativeIOS, stableAppleSubscriptionAccess, signedAppTransaction } from "@/lib/appleSubscriptions";
import { getSavedWebSubscriptionAccess } from "@/lib/webSubscriptionAccess";

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "grace_period"]);

// S&S sells one digital membership: Full Quarry Intelligence, with no free trial.
// Storefront pricing is managed by the purchase provider.
// "marketplace_monthly" is retained for legacy receipt recognition (restore of
// historical purchases) but is the same $69/month product as professional_monthly.
export const FULL_QUARRY_PLAN_CODES = new Set([
  "professional_monthly",
  "marketplace_monthly",
]);

export function entitlementIsCurrent(row) {
  if (!row || !ACTIVE_SUBSCRIPTION_STATUSES.has(row.status)) return false;
  if (!row.expires_at) return true;
  const expires = new Date(row.expires_at).getTime();
  return Number.isFinite(expires) && expires > Date.now();
}

export function entitlementGrantsFullQuarryAccess(row) {
  return entitlementIsCurrent(row) && FULL_QUARRY_PLAN_CODES.has(String(row.plan_code || ""));
}

export function findFullQuarryEntitlement(rows = []) {
  return (rows || []).find(entitlementGrantsFullQuarryAccess) || null;
}

export function hasFullQuarryEntitlement(rows = []) {
  return Boolean(findFullQuarryEntitlement(rows));
}

export async function premiumAccessProofParams() {
  if (isNativeIOS()) {
    try {
      const access = await stableAppleSubscriptionAccess({ attempts: 2 });
      const appleTransactions = (access?.purchases || [])
        .map((p) => p?.jwsRepresentation || p?.jws || p?.signedTransactionInfo || p?.transactionJws)
        .filter(Boolean);
      if (appleTransactions.length) {
        return {
          apple_transactions: appleTransactions,
          apple_app_transaction: await signedAppTransaction(),
        };
      }
    } catch (error) {
      console.error("Apple premium proof could not be prepared", error);
    }
    return {};
  }

  const saved = getSavedWebSubscriptionAccess();
  if (saved?.sessionId && saved?.browserSessionId) {
    return {
      stripe_session_id: saved.sessionId,
      stripe_browser_session_id: saved.browserSessionId,
    };
  }
  return {};
}

export async function premiumSiteData(miningSiteId) {
  const proof = await premiumAccessProofParams();
  const response = await base44.functions.invoke("get-premium-site-data", {
    mining_site_id: miningSiteId,
    ...proof,
  });
  const payload = response?.data || response || {};
  if (payload?.error || !payload?.entitled) {
    throw new Error(payload?.error || "Full Quarry Intelligence subscription required");
  }
  return payload;
}

export async function premiumEntityQuery(entityName, query = {}, sort = "-updated_date", limit = 50, skip = 0) {
  const proof = await premiumAccessProofParams();
  const response = await base44.functions.invoke("get-premium-site-data", {
    operation: "entity",
    entity_name: entityName,
    query,
    sort,
    limit,
    skip,
    ...proof,
  });
  const payload = response?.data || response || {};
  if (payload?.error || !payload?.entitled) {
    throw new Error(payload?.error || "Full Quarry Intelligence subscription required");
  }
  return payload?.rows || [];
}

export async function premiumEntityRecord(entityName, recordId) {
  if (!recordId) return null;
  const proof = await premiumAccessProofParams();
  const response = await base44.functions.invoke("get-premium-site-data", {
    operation: "entity",
    entity_name: entityName,
    record_id: recordId,
    ...proof,
  });
  const payload = response?.data || response || {};
  if (payload?.error || !payload?.entitled) {
    throw new Error(payload?.error || "Full Quarry Intelligence subscription required");
  }
  return payload?.record || null;
}