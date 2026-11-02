import { base44 } from "@/api/base44Client";

// The free trial (SubscriptionTrial, started by start-free-trial when a
// signed-in visitor reaches /subscribe) grants the same access a paid membership
// does. Both sides read it through this one rule: the backend mirror lives in
// base44/shared/premiumEntitlement.ts (trialIsCurrent).
export const TRIAL_DAYS = 3;

export function trialIsActive(row) {
  if (!row || String(row.status) !== "Active") return false;
  const endsAt = Date.parse(row.ends_at);
  return Number.isFinite(endsAt) && endsAt > Date.now();
}

export function trialDaysLeft(row) {
  const endsAt = Date.parse(row?.ends_at);
  if (!Number.isFinite(endsAt)) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000));
}

export async function loadTrialState(userId) {
  const empty = { active: false, daysLeft: 0, ended: false, row: null };
  if (!userId) return empty;
  const rows = await base44.entities.SubscriptionTrial.filter({ user_id: userId }, "-created_date", 5);
  const row = (rows || [])[0] || null;
  if (!row) return empty;
  const active = trialIsActive(row);
  return { active, daysLeft: active ? trialDaysLeft(row) : 0, ended: !active, row };
}