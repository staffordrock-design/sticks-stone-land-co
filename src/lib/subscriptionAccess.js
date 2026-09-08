export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trial", "grace_period"]);

// S&S sells one digital membership: Full Quarry Intelligence, with no free trial. Storefront pricing is managed by the purchase provider.
// Keep legacy Deal entitlements honored for existing customers, but do not let the
// retired Marketplace tier unlock professional quarry intelligence.
export const FULL_QUARRY_PLAN_CODES = new Set([
  "professional_monthly",
  "professional_annual",
  "deal_monthly",
  "deal_annual",
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
