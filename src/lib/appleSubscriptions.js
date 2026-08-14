import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { base44 } from '@/api/base44Client';
import { ACCESS_TIERS, SUBSCRIPTION_PRODUCTS } from '@/lib/subscriptionPlans';

export function isNativeIOS() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export function appleProductIds() {
  return ACCESS_TIERS.flatMap((tier) => [
    SUBSCRIPTION_PRODUCTS.apple[tier.code]?.monthly,
    SUBSCRIPTION_PRODUCTS.apple[tier.code]?.annual,
  ]).filter(Boolean);
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
    const { appTransaction } = await NativePurchases.getAppTransaction();
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
  if (!isNativeIOS()) return { skipped: true };
  if (restore) await NativePurchases.restorePurchases();

  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
  });

  return verifyAppleTransactions(purchases || [], { reconcile: true });
}
