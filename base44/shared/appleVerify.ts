import { SignedDataVerifier, Environment } from 'npm:@apple/app-store-server-library@3.1.0';
import { Buffer } from 'node:buffer';

export const BUNDLE_ID = 'com.base6a78376a454093ba2f431acd.app';

const APPLE_ROOT_CERT_URLS = [
  'https://www.apple.com/appleca/AppleIncRootCertificate.cer',
  'https://www.apple.com/certificateauthority/AppleRootCA-G2.cer',
  'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer',
];

let rootCertificatesPromise = null;

export function getRootCertificates() {
  if (!rootCertificatesPromise) {
    rootCertificatesPromise = Promise.all(APPLE_ROOT_CERT_URLS.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load Apple root certificate (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    })).catch((error) => {
      rootCertificatesPromise = null;
      throw error;
    });
  }
  return rootCertificatesPromise;
}

export function decodeUnverifiedPayload(jws) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple signed transaction format');
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
}

export function environmentFor(value) {
  if (value === 'Production') return Environment.PRODUCTION;
  if (value === 'Sandbox') return Environment.SANDBOX;
  throw new Error(`Unsupported Apple transaction environment: ${value || 'unknown'}`);
}

export function isoFromMillis(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : '';
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function accountTokenForUser(userId) {
  const hex = await sha256Hex(`ssrockholdings:${userId}`);
  const bytes = [];
  for (let i = 0; i < 32; i += 2) bytes.push(hex.slice(i, i + 2));
  bytes[6] = ((parseInt(bytes[6], 16) & 0x0f) | 0x50).toString(16).padStart(2, '0');
  bytes[8] = ((parseInt(bytes[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  const joined = bytes.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20, 32)}`;
}

// Verifies the Apple app transaction (when supplied) and every signed purchase transaction.
// Checks appAccountToken ownership when expectedUserId is provided.
// Returns { verified: [{ transaction, productId, transactionId, originalTransactionId, signedTransaction }], appAppleId, environment }
export async function verifyApplePurchases({ signedTransactions, signedAppTransaction, expectedUserId }) {
  const rootCertificates = await getRootCertificates();
  let verifiedAppAppleId;
  let verifiedAppEnvironment;

  if (signedAppTransaction) {
    const appHint = decodeUnverifiedPayload(signedAppTransaction);
    verifiedAppEnvironment = environmentFor(appHint.receiptType);
    verifiedAppAppleId = verifiedAppEnvironment === Environment.PRODUCTION ? Number(appHint.appAppleId) : undefined;
    if (verifiedAppEnvironment === Environment.PRODUCTION && !Number.isFinite(verifiedAppAppleId)) {
      throw new Error('Apple app transaction is missing appAppleId');
    }
    const appVerifier = new SignedDataVerifier(rootCertificates, true, verifiedAppEnvironment, BUNDLE_ID, verifiedAppAppleId);
    await appVerifier.verifyAndDecodeAppTransaction(signedAppTransaction);
  }

  const verified = [];
  for (const signedTransaction of signedTransactions) {
    const hint = decodeUnverifiedPayload(signedTransaction);
    const environment = environmentFor(hint.environment);
    const appAppleId = environment === Environment.PRODUCTION ? verifiedAppAppleId : undefined;
    if (environment === Environment.PRODUCTION && !Number.isFinite(appAppleId)) {
      throw new Error('Verified Apple app transaction is required for production purchases');
    }
    if (verifiedAppEnvironment && verifiedAppEnvironment !== environment) {
      throw new Error('Apple app and purchase environments do not match');
    }
    const verifier = new SignedDataVerifier(rootCertificates, true, environment, BUNDLE_ID, appAppleId);
    const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
    const productId = String(transaction.productId || '');
    const transactionId = String(transaction.transactionId || '');
    const originalTransactionId = String(transaction.originalTransactionId || transactionId);
    if (!transactionId || !originalTransactionId) throw new Error('Apple transaction identifier missing');

    if (transaction.appAccountToken && expectedUserId) {
      const expectedToken = await accountTokenForUser(expectedUserId);
      if (String(transaction.appAccountToken).toLowerCase() !== expectedToken.toLowerCase()) {
        throw new Error('Apple purchase belongs to a different S&S account');
      }
    }
    verified.push({ transaction, productId, transactionId, originalTransactionId, signedTransaction });
  }
  return { verified, appAppleId: verifiedAppAppleId, environment: verifiedAppEnvironment };
}