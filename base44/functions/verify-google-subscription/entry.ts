import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { verifyGooglePurchase, isGoogleProductId, getPlanForGoogleProduct } from '../../shared/googlePlayVerify.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const body = await req.json();
    const purchases = Array.isArray(body?.purchases) ? body.purchases : [];
    const reconcile = body?.reconcile === true;

    if (!purchases.length && !reconcile) {
      return Response.json({ error: 'No Google Play purchases supplied' }, { status: 400 });
    }

    const now = Date.now();
    const results = [];
    const verifiedTokens = new Set();

    for (const item of purchases) {
      const productId = String(item?.productId || '');
      const purchaseToken = String(item?.purchaseToken || '');
      if (!productId || !purchaseToken || !isGoogleProductId(productId)) continue;

      const verified = await verifyGooglePurchase({
        productId,
        purchaseToken,
        secrets,
        isSubscription: getPlanForGoogleProduct(productId) !== null,
      });

      verifiedTokens.add(purchaseToken);
      const planCode = verified.planCode;
      if (!planCode) throw new Error(`Unrecognized Google product: ${productId}`);

      const purchaseState = verified.purchaseState;
      // 0 = purchased, 1 = canceled, 2 = pending
      const active = purchaseState === 0;
      const status = purchaseState === 1 ? 'cancelled' : purchaseState === 2 ? 'pending' : 'active';

      // Store receipt
      const existingReceipt = await base44.asServiceRole.entities.StoreReceipt.filter(
        { platform: 'Google', transaction_id: purchaseToken },
        '-created_date', 1, 0,
      );
      if (existingReceipt?.[0] && existingReceipt[0].user_id !== user.id) {
        return Response.json({ error: 'This Google subscription is already linked to another account' }, { status: 409 });
      }

      const receiptData = {
        user_id: user.id,
        platform: 'Google',
        product_id: productId,
        transaction_id: purchaseToken,
        original_transaction_id: verified.orderId,
        purchase_date: verified.purchase.startTimeMillis ? new Date(Number(verified.purchase.startTimeMillis)).toISOString() : new Date().toISOString(),
        expires_at: verified.purchase.expiryTimeMillis ? new Date(Number(verified.purchase.expiryTimeMillis)).toISOString() : '',
        status: active ? 'Verified' : 'Expired',
        last_verified_at: new Date().toISOString(),
      };

      if (existingReceipt?.[0]) {
        await base44.asServiceRole.entities.StoreReceipt.update(existingReceipt[0].id, receiptData);
      } else {
        await base44.asServiceRole.entities.StoreReceipt.create(receiptData);
      }

      // Update entitlement
      const entitlements = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
        { user_id: user.id, platform: 'google' }, '-updated_date', 20, 0,
      );
      const sameSubscription = entitlements.find((row) => row.original_transaction_id === verified.orderId);
      const entitlementData = {
        user_id: user.id,
        plan_code: planCode,
        status,
        platform: 'google',
        product_id: productId,
        original_transaction_id: verified.orderId,
        expires_at: verified.purchase.expiryTimeMillis ? new Date(Number(verified.purchase.expiryTimeMillis)).toISOString() : '',
        started_at: verified.purchase.startTimeMillis ? new Date(Number(verified.purchase.startTimeMillis)).toISOString() : new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        source: 'Google Play Developer API verified',
      };

      if (sameSubscription) {
        await base44.asServiceRole.entities.SubscriptionEntitlement.update(sameSubscription.id, entitlementData);
      } else {
        await base44.asServiceRole.entities.SubscriptionEntitlement.create(entitlementData);
      }

      results.push({
        product_id: productId,
        plan_code: planCode,
        status,
        active,
        expires_at: entitlementData.expires_at,
      });
    }

    // Reconciliation: mark any Google entitlements not in the current purchase set as expired
    if (reconcile) {
      const googleEntitlements = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
        { user_id: user.id, platform: 'google' }, '-updated_date', 50, 0,
      );
      for (const entitlement of googleEntitlements || []) {
        if (entitlement.original_transaction_id && !verifiedTokens.has(entitlement.transaction_id) && ['active', 'trial', 'grace_period'].includes(entitlement.status)) {
          await base44.asServiceRole.entities.SubscriptionEntitlement.update(entitlement.id, {
            status: 'expired',
            last_verified_at: new Date().toISOString(),
            source: 'Google Play current-entitlement reconciliation',
          });
        }
      }
    }

    return Response.json({ verified: true, entitlements: results });
  } catch (error) {
    console.error('verify-google-subscription error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}