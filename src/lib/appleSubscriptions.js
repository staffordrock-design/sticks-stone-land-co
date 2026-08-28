import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { base44 } from '@/api/base44Client';
import { ACCESS_TIERS, SUBSCRIPTION_PRODUCTS } from '@/lib/subscriptionPlans';

const STOREKIT_TIMEOUT_MS = 12000;
const APPLE_ACCESS_CACHE_MS = 5 * 60 * 1000;
let lastConfirmedAppleAccess = null;
let lastConfirmedAppleAccessAt = 0;

function withStoreKitTimeout(promise, message = 'Apple did not respond. Please try again.') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), STOREKIT_TIMEOUT_MS)),
  ]);
}

export function isNativeIOS() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export function appleProductIds() {
  return ACCESS_TIERS.flatMap((tier) => [
    SUBSCRIPTION_PRODUCTS.apple[tier.code]?.monthly,
    SUBSCRIPTION_PRODUCTS.apple[tier.code]?.annual,
  ]).filter(Boolean);
}

const APPLE_PRODUCT_TO_PLAN = Object.fromEntries(
  ACCESS_TIERS.flatMap((tier) => [
    [SUBSCRIPTION_PRODUCTS.apple[tier.code]?.monthly, `${tier.code}_monthly`],
    [SUBSCRIPTION_PRODUCTS.apple[tier.code]?.annual, `${tier.code}_annual`],
  ]).filter(([productId]) => Boolean(productId))
);

export function applePlanCodeForProduct(productId) {
  return APPLE_PRODUCT_TO_PLAN[productId] || null;
}

export async function currentAppleSubscriptionAccess({ restore = false, allowRecentConfirmedFallback = true } = {}) {
  if (!isNativeIOS()) return { active: false, professional: false, purchases: [], productIds: [], planCodes: [] };
  if (restore) await withStoreKitTimeout(
    NativePurchases.restorePurchases(),
    'Apple restore did not respond. Please try again from Restore Purchases.'
  );

  const { purchases = [] } = await withStoreKitTimeout(
    NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
      onlyCurrentEntitlements: true,
    }),
    'Apple subscription check did not respond. You can still browse the preview and try again.'
  );
  const current = (purchases || []).filter((tx) => appleProductIds().includes(tx?.productIdentifier));
  const productIds = current.map((tx) => tx.productIdentifier).filter(Boolean);
  const planCodes = productIds.map(applePlanCodeForProduct).filter(Boolean);
  const professional = planCodes.some((code) => code.startsWith('professional_') || code.startsWith('deal_investor_'));
  const access = {
    active: current.length > 0,
    professional,
    purchases: current,
    productIds,
    planCodes,
  };

  if (access.active && access.professional) {
    lastConfirmedAppleAccess = access;
    lastConfirmedAppleAccessAt = Date.now();
    return access;
  }

  if (
    allowRecentConfirmedFallback &&
    lastConfirmedAppleAccess?.active &&
    lastConfirmedAppleAccess?.professional &&
    Date.now() - lastConfirmedAppleAccessAt < APPLE_ACCESS_CACHE_MS
  ) {
    return { ...lastConfirmedAppleAccess, cached: true };
  }

  return access;
}

export async function stableAppleSubscriptionAccess({ attempts = 4, restore = false } = {}) {
  let access = null;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      access = await currentAppleSubscriptionAccess({ restore: restore && attempt === 1 });
      if (access?.active && access?.professional) return access;
    } catch (error) {
      lastError = error;
      if (
        lastConfirmedAppleAccess?.active &&
        lastConfirmedAppleAccess?.professional &&
        Date.now() - lastConfirmedAppleAccessAt < APPLE_ACCESS_CACHE_MS
      ) {
        return { ...lastConfirmedAppleAccess, cached: true, storeCheckError: true };
      }
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
  }
  if (lastError && !access) throw lastError;
  return access || { active: false, professional: false, purchases: [], productIds: [], planCodes: [] };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function appleAccountTokenForUser(userId) {
  const hex = await sha256Hex(`ssrockholdings:${userId}`);
  const bytes = [];
  for (let i = 0; i < 32; i += 2) bytes.push(hex.slice(i, i + 2));
  bytes[6] = ((parseInt(bytes[6], 16) & 0x0f) | 0x50).toString(16).padStart(2, '0');
  bytes[8] = ((parseInt(bytes[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  const joined = bytes.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20, 32)}`;
}

async function signedAppTransaction() {
  try {
    const { appTransaction } = await withStoreKitTimeout(
      NativePurchases.getAppTransaction(),
      'Apple app transaction did not respond.'
    );
    return appTransaction?.jwsRepresentation || '';
  } catch {
    return '';
  }
}

export async function verifyAppleTransactions(transactions, { reconcile = false } = {}) {
  const signedTransactions = (transactions || [])
    .filter((tx) => appleProductIds().includes(tx?.productIdentifier))
    .map((tx) => tx?.jwsRepresentation)
    .filter(Boolean);

  const appTransaction = await signedAppTransaction();
  const response = await base44.functions.invoke('verify-apple-subscription', {
    signed_transactions: signedTransactions,
    signed_app_transaction: appTransaction,
    reconcile,
  });

  if (response?.data?.error) throw new Error(response.data.error);
  return response?.data || {};
}

export async function syncCurrentAppleSubscriptions({ restore = false } = {}) {
  if (!isNativeIOS()) return { skipped: true, active: false, professional: false, purchases: [] };

  const access = await currentAppleSubscriptionAccess({ restore });
  let user = null;
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }

  // Apple requires registration to remain optional for StoreKit purchases.
  // Anonymous subscribers are authorized directly from StoreKit currentEntitlements.
  // If they later sign in, the same signed transactions are linked to their S&S account.
  if (!user?.id) return { ...access, anonymous: true };

  const verified = await verifyAppleTransactions(access.purchases, { reconcile: true });
  return { ...verified, ...access, anonymous: false };
}

export async function verifyAppleDataRoom(transaction, listingId) {
  const signedTransaction = transaction?.jwsRepresentation;
  if (!signedTransaction) throw new Error("Apple transaction is missing a signed payload.");
  const appTransaction = await signedAppTransaction();
  const response = await base44.functions.invoke("verify-apple-data-room", {
    signed_transaction: signedTransaction,
    signed_app_transaction: appTransaction,
    listing_id: listingId,
  });
  if (response?.data?.error) throw new Error(response.data.error);
  return response?.data || {};
}