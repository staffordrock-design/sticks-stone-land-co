import { createClientFromRequest } from 'npm:@base44/sdk';
import { verifyApplePurchases, sha256Hex, isoFromMillis } from '../../shared/appleVerify.ts';

const PRODUCT_TO_PLAN = {
  'com.ssrockholdings.mobile.quarryintelligence.monthly199': 'professional_monthly',
  'com.ssrockholdings.quarryintelligence.monthly199': 'professional_monthly',
  'com.ssrockholdings.marketplace.monthly': 'marketplace_monthly',
  'com.ssrockholdings.marketplace.annual': 'marketplace_annual',
  'com.ssrockholdings.professional.monthly': 'professional_monthly',
  'com.ssrockholdings.professional.annual': 'professional_annual',
  'com.ssrockholdings.deal.monthly': 'deal_monthly',
  'com.ssrockholdings.deal.annual': 'deal_annual',
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const body = await req.json();
    const signedTransactions = Array.isArray(body?.signed_transactions)
      ? body.signed_transactions.filter((value) => typeof value === 'string' && value.length > 50).slice(0, 20)
      : [];
    const signedAppTransaction = typeof body?.signed_app_transaction === 'string' ? body.signed_app_transaction : '';
    const reconcile = body?.reconcile === true;

    if (!signedTransactions.length && !reconcile) {
      return Response.json({ error: 'No Apple signed transactions supplied' }, { status: 400 });
    }

    const { verified } = await verifyApplePurchases({
      signedTransactions,
      signedAppTransaction,
      expectedUserId: user.id,
    });

    const now = Date.now();
    const results = [];
    const verifiedOriginalIds = new Set();

    for (const purchase of verified) {
      const { transaction, productId, transactionId, originalTransactionId, signedTransaction } = purchase;
      const planCode = PRODUCT_TO_PLAN[productId];
      if (!planCode) throw new Error(`Unrecognized Apple product: ${productId || 'missing'}`);
      verifiedOriginalIds.add(originalTransactionId);

      const existingReceipt = await base44.asServiceRole.entities.StoreReceipt.filter(
        { platform: 'Apple', original_transaction_id: originalTransactionId },
        '-created_date',
        1,
        0,
      );
      if (existingReceipt?.[0] && existingReceipt[0].user_id !== user.id) {
        return Response.json({ error: 'This Apple subscription is already linked to another account' }, { status: 409 });
      }

      const revoked = Boolean(transaction.revocationDate);
      const expiresMs = Number(transaction.expiresDate || 0);
      const expired = expiresMs > 0 && expiresMs <= now;
      const active = !revoked && !expired;
      const status = revoked ? 'cancelled' : expired ? 'expired' : 'active';
      const receiptStatus = revoked ? 'Refunded' : expired ? 'Expired' : 'Verified';
      const verifiedAt = new Date().toISOString();
      const purchaseDate = isoFromMillis(transaction.purchaseDate);
      const expiresAt = isoFromMillis(transaction.expiresDate);
      const payloadHash = await sha256Hex(signedTransaction);

      const receiptData = {
        user_id: user.id,
        platform: 'Apple',
        product_id: productId,
        transaction_id: transactionId,
        original_transaction_id: originalTransactionId,
        purchase_date: purchaseDate,
        expires_at: expiresAt,
        status: receiptStatus,
        verification_payload_hash: payloadHash,
        last_verified_at: verifiedAt,
      };

      if (existingReceipt?.[0]) {
        await base44.asServiceRole.entities.StoreReceipt.update(existingReceipt[0].id, receiptData);
      } else {
        await base44.asServiceRole.entities.StoreReceipt.create(receiptData);
      }

      const entitlements = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
        { user_id: user.id, platform: 'apple' },
        '-updated_date',
        20,
        0,
      );
      const sameSubscription = entitlements.find((row) => row.original_transaction_id === originalTransactionId);
      const entitlementData = {
        user_id: user.id,
        plan_code: planCode,
        status,
        platform: 'apple',
        product_id: productId,
        original_transaction_id: originalTransactionId,
        expires_at: expiresAt,
        started_at: purchaseDate,
        last_verified_at: verifiedAt,
        source: 'Apple StoreKit verified JWS',
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
        expires_at: expiresAt,
      });
    }

    // Do not expire a previously verified backend entitlement merely because one
    // client-side StoreKit snapshot omitted it. TestFlight runs IAP in Apple's
    // sandbox and current-entitlement snapshots can change between launches or
    // test accounts. Verified signed transactions create/update the entitlement;
    // revocation or expiry from a verified transaction changes its status.
    // Server notifications / a verified later transaction are authoritative for
    // removing access, not absence from this single client reconciliation call.

    return Response.json({ verified: true, entitlements: results });
  } catch (error) {
    console.error('verify-apple-subscription error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}