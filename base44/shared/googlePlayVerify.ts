// Google Play Billing Library v5+ server-side verification.
// Uses Google Play Developer API to verify purchases and manage acknowledgments.
// Docs: https://developer.android.com/google/play/billing/security

const PACKAGE_NAME = 'com.ssrockholdings.quarrymarketplace';

const PRODUCT_TO_PLAN = {
  'ssrockholdings_marketplace_monthly': 'marketplace_monthly',
  'ssrockholdings_marketplace_annual': 'marketplace_annual',
  'ssrockholdings_professional_monthly': 'professional_monthly',
  'ssrockholdings_professional_annual': 'professional_annual',
  'ssrockholdings_deal_monthly': 'deal_monthly',
  'ssrockholdings_deal_annual': 'deal_annual',
};

const DATA_ROOM_PRODUCT_ID = 'ssrockholdings_dataroom_access';

// Get a Google OAuth2 access token using the service account JSON key.
// The key is stored as a secret (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).
async function getAccessToken(secrets) {
  const keyJson = secrets.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!keyJson) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret is not set');
  const key = JSON.parse(keyJson);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc(header)}.${enc(payload)}`;

  // Import the private key for signing
  const pemContents = key.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const keyObj = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyObj,
    new TextEncoder().encode(unsigned)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsigned}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google OAuth token error: ${err}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// Verify a Google Play purchase token against the Play Developer API.
// Returns verified purchase details for subscription or one-time product.
export async function verifyGooglePurchase({ productId, purchaseToken, secrets, isSubscription = false }) {
  const accessToken = await getAccessToken(secrets);
  const productType = isSubscription ? 'subscriptions' : 'products';
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/${productType}/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Play verification failed: ${err}`);
  }
  const purchase = await res.json();

  // purchaseToken is unique per purchase; use it as the transaction identifier
  const transactionId = purchaseToken;
  const orderId = purchase.orderId || purchaseToken;
  const planCode = PRODUCT_TO_PLAN[productId];
  const isDataRoom = productId === DATA_ROOM_PRODUCT_ID;

  // Acknowledge the purchase so it doesn't auto-refund
  await acknowledgeGooglePurchase({ productId, purchaseToken, accessToken, isSubscription });

  return {
    purchase,
    productId,
    transactionId,
    orderId,
    planCode,
    isDataRoom,
    purchaseState: purchase.purchaseState, // 0 = purchased, 1 = canceled, 2 = pending
    consumptionState: purchase.consumptionState, // 0 = not consumed, 1 = consumed
    acknowledged: purchase.acknowledgementState === 1,
  };
}

async function acknowledgeGooglePurchase({ productId, purchaseToken, accessToken, isSubscription }) {
  const productType = isSubscription ? 'subscriptions' : 'products';
  let url;
  if (isSubscription) {
    url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/${productType}/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  } else {
    url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/${productType}/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  }
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export function isGoogleProductId(productId) {
  return Boolean(PRODUCT_TO_PLAN[productId] || productId === DATA_ROOM_PRODUCT_ID);
}

export function getPlanForGoogleProduct(productId) {
  return PRODUCT_TO_PLAN[productId] || null;
}

export const GOOGLE_DATA_ROOM_PRODUCT_ID = DATA_ROOM_PRODUCT_ID;