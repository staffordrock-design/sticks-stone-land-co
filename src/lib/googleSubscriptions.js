import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { base44 } from '@/api/base44Client';
import { ACCESS_TIERS, SUBSCRIPTION_PRODUCTS, DATA_ROOM_GOOGLE_PRODUCT_ID } from '@/lib/subscriptionPlans';

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function googleProductIds() {
  return ACCESS_TIERS.flatMap((tier) => [
    SUBSCRIPTION_PRODUCTS.google[tier.code]?.monthly,
    SUBSCRIPTION_PRODUCTS.google[tier.code]?.annual,
  ]).filter(Boolean);
}

export async function verifyGoogleTransactions(purchases, { reconcile = false } = {}) {
  const items = (purchases || [])
    .filter((p) => googleProductIds().includes(p?.productId))
    .map((p) => ({ productId: p.productId, purchaseToken: p.purchaseToken }))
    .filter((p) => p.productId && p.purchaseToken);

  const response = await base44.functions.invoke('verify-google-subscription', {
    purchases: items,
    reconcile,
  });

  if (response?.data?.error) throw new Error(response.data.error);
  return response?.data || {};
}

export async function syncCurrentGoogleSubscriptions({ restore = false } = {}) {
  if (!isNativeAndroid()) return { skipped: true };
  if (restore) await NativePurchases.restorePurchases();

  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
  });

  return verifyGoogleTransactions(purchases || [], { reconcile: true });
}

export async function verifyGoogleDataRoom(transaction, listingId) {
  const productId = transaction?.productId;
  const purchaseToken = transaction?.purchaseToken;
  if (!productId || !purchaseToken) throw new Error('Google Play purchase token is missing.');

  const response = await base44.functions.invoke('verify-google-data-room', {
    productId,
    purchaseToken,
    listing_id: listingId,
  });

  if (response?.data?.error) throw new Error(response.data.error);
  return response?.data || {};
}