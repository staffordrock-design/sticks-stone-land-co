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
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }

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
      expectedUserId: user?.id,
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
      const anonymousUserId = `apple-anonymous:${(await sha256Hex(originalTransactionId)).slice(0, 32)}`;
      const existingUserId = String(existingReceipt?.[0]?.user_id || '');
      const existingIsAnonymous = existingUserId.startsWith('apple-anonymous:');
      if (user?.id && existingReceipt?.[0] && existingUserId !== user.id && !existingIsAnonymous) {
        return Response.json({ error: 'This Apple subscription is already linked to another account' }, { status: 409 });
      }
      const recordUserId = user?.id || existingUserId || anonymousUserId;

      const revoked = Boolean(transaction.revocationDate);
      const expiresMs = Number(transaction.expiresDate || 0);
      const expired = expiresMs > 0 && expiresMs <= now;
      const offerDiscountType = String(transaction.offerDiscountType || '').toUpperCase();
      const transactionPriceMilliunits = Number(transaction.price);
      const freeTrial = offerDiscountType === 'FREE_TRIAL' || (Number(transaction.offerType) === 1 && transactionPriceMilliunits === 0);
      const active = !revoked && !expired;
      const status = revoked ? 'cancelled' : expired ? 'expired' : freeTrial ? 'trial' : 'active';
      const receiptStatus = revoked ? 'Refunded' : expired ? 'Expired' : 'Verified';
      const verifiedAt = new Date().toISOString();
      const purchaseDate = isoFromMillis(transaction.purchaseDate);
      const expiresAt = isoFromMillis(transaction.expiresDate);
      const payloadHash = await sha256Hex(signedTransaction);

      const receiptData = {
        user_id: recordUserId,
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

      if (user?.id) {
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
      }

      // Keep the owner revenue dashboard synchronized with verified StoreKit activity.
      // A 3-day Apple free trial is a real subscription entitlement but is not paid revenue yet.
      const amountFromApple = Number.isFinite(transactionPriceMilliunits) && transactionPriceMilliunits >= 0
        ? transactionPriceMilliunits / 1000
        : (productId === 'com.ssrockholdings.mobile.quarryintelligence.monthly199' || productId === 'com.ssrockholdings.quarryintelligence.monthly199' ? 199 : 0);
      const billingStatus = revoked ? 'Refunded' : expired ? 'Cancelled' : freeTrial ? 'Pending' : 'Paid';
      const billingData = {
        user_id: recordUserId,
        customer_email: user?.email || '',
        revenue_type: 'Subscription',
        plan_or_product: planCode,
        amount: amountFromApple,
        currency: String(transaction.currency || 'USD').toUpperCase(),
        platform: 'Apple',
        status: billingStatus,
        external_transaction_id: transactionId,
        occurred_at: purchaseDate || verifiedAt,
        notes: freeTrial
          ? `Apple verified 3-day introductory free trial; payment is due when the trial converts.${user?.id ? '' : ' Purchased without an S&S login; StoreKit access is active and the subscription can be linked later.'}`
          : `Apple StoreKit verified subscription transaction.${user?.id ? '' : ' Purchased without an S&S login; StoreKit access is active and the subscription can be linked later.'}`,
      };
      const existingBilling = await base44.asServiceRole.entities.BillingEvent.filter(
        { platform: 'Apple', external_transaction_id: transactionId },
        '-created_date',
        1,
        0,
      );
      if (existingBilling?.[0]) {
        await base44.asServiceRole.entities.BillingEvent.update(existingBilling[0].id, billingData);
      } else {
        await base44.asServiceRole.entities.BillingEvent.create(billingData);
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

    return Response.json({ verified: true, anonymous: !user?.id, entitlements: results });
  } catch (error) {
    console.error('verify-apple-subscription error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 400 });
  }
}