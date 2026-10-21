// Owner identity for server-side entitlement/authorization checks.
//
// The app owner signs in with Apple + Hide My Email, which resolves to a
// DIFFERENT User record (a private relay address, role "user", no entitlements)
// than her admin record. Server checks therefore accept these owner addresses
// wherever `user?.role === 'admin'` is trusted, so the client gate and the
// server entitlement paths agree on who the owner is.
//
// Case-insensitive match on the signed-in user's email. A missing/anonymous user
// never matches.
//
// Mirrored client-side in src/lib/ownerAccess.js — keep both in sync.

export const OWNER_EMAILS = [
  'staffordrock@icloud.com',
  'xtchz7fj6n@privaterelay.appleid.com',
];

export function isOwnerUser(user: any): boolean {
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(email) && OWNER_EMAILS.includes(email);
}