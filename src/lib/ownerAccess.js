// Owner identity for client-side access checks.
//
// The app owner signs in with Apple + Hide My Email, which resolves to a
// DIFFERENT User record (a private relay address, role "user", no entitlements)
// than her admin record. Access checks therefore accept these owner addresses
// anywhere the admin role is accepted, so the owner is never locked out of her
// own app when she signs in with Apple.
//
// Case-insensitive match on the signed-in user's email. A missing/anonymous user
// never matches. This grants no access on its own beyond what an admin already
// has — active subscribers and admins keep their existing paths untouched.
//
// Mirrored server-side in base44/shared/ownerAccess.ts — keep both in sync.

export const OWNER_EMAILS = [
  "staffordrock@icloud.com",
  "xtchz7fj6n@privaterelay.appleid.com",
];

export function isOwner(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return Boolean(email) && OWNER_EMAILS.includes(email);
}