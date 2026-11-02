import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { isEntitledEntitlement, trialIsCurrent, TRIAL_DAYS } from '../../shared/premiumEntitlement.ts';
import { isOwnerUser } from '../../shared/ownerAccess.ts';

const TRIAL_PLAN_CODE = 'professional_monthly';

function daysLeft(endsAt: any) {
  const ms = Date.parse(endsAt);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
}

// Starts the one free trial an account may ever have. The client cannot
// choose the length, the plan or the price: those are fixed here and the write
// runs as the service role, because SubscriptionTrial is admin-write only.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user?.id) return Response.json({ error: 'Sign in to start your free trial' }, { status: 401 });

    if (user.role === 'admin' || isOwnerUser(user)) {
      return Response.json({ started: false, reason: 'internal_access', days_left: 0 });
    }

    const entitlements = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
      { user_id: user.id },
      '-updated_date',
      20,
      0,
    );
    if ((entitlements || []).some(isEntitledEntitlement)) {
      return Response.json({ started: false, reason: 'already_subscribed', days_left: 0 });
    }

    const trials = await base44.asServiceRole.entities.SubscriptionTrial.filter(
      { user_id: user.id },
      '-created_date',
      5,
      0,
    );
    const existing = (trials || [])[0];

    if (existing) {
      if (trialIsCurrent(existing)) {
        return Response.json({
          started: false,
          reason: 'trial_active',
          trial: existing,
          days_left: daysLeft(existing.ends_at),
        });
      }
      if (String(existing.status) === 'Active') {
        // The window closed while the record still read Active: close it out so
        // the account is reported (and enforced) as expired, not in trial.
        const closed = await base44.asServiceRole.entities.SubscriptionTrial.update(existing.id, { status: 'Expired' });
        return Response.json({ started: false, reason: 'trial_expired', trial: closed, days_left: 0 });
      }
      return Response.json({
        started: false,
        reason: 'trial_already_used',
        trial: existing,
        days_left: 0,
      });
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + TRIAL_DAYS * 86400000);

    const trial = await base44.asServiceRole.entities.SubscriptionTrial.create({
      user_id: user.id,
      plan_code: TRIAL_PLAN_CODE,
      status: 'Active',
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      description: `Free ${TRIAL_DAYS}-day trial started from the website. No card was collected.`,
    });

    console.log('free trial started', { user_id: user.id, trial_id: trial?.id, ends_at: endsAt.toISOString() });
    return Response.json({ started: true, reason: 'trial_started', trial, days_left: TRIAL_DAYS });
  } catch (error: any) {
    console.error('start-free-trial error:', error?.message || String(error));
    return Response.json({ error: error?.message || 'Could not start the free trial' }, { status: 500 });
  }
}