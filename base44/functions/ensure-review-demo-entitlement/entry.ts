import { createClientFromRequest } from 'npm:@base44/sdk';

const REVIEW_DEMO_EMAIL = 'contact+appreview@ssrockholdings.com';
const REVIEW_DEMO_EXPIRES_YEARS = 10;
const REVIEW_DEMO_SOURCE = 'Apple App Review demo account';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Sign in required' }, { status: 401 });

    if (!user.email || user.email.toLowerCase() !== REVIEW_DEMO_EMAIL) {
      return Response.json({ granted: false, reason: 'not_review_demo_account' });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + REVIEW_DEMO_EXPIRES_YEARS);
    const nowIso = now.toISOString();
    const expiresIso = expiresAt.toISOString();

    const existing = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
      { user_id: user.id, platform: 'admin', source: REVIEW_DEMO_SOURCE },
      '-updated_date',
      5,
      0,
    );

    if (existing?.[0]) {
      await base44.asServiceRole.entities.SubscriptionEntitlement.update(existing[0].id, {
        status: 'active',
        expires_at: expiresIso,
        last_verified_at: nowIso,
      });
      return Response.json({ granted: true, entitlement_id: existing[0].id, refreshed: true, expires_at: expiresIso });
    }

    const created = await base44.asServiceRole.entities.SubscriptionEntitlement.create({
      user_id: user.id,
      plan_code: 'professional_annual',
      status: 'active',
      platform: 'admin',
      product_id: 'apple_review_demo',
      original_transaction_id: 'apple-review-demo',
      expires_at: expiresIso,
      started_at: nowIso,
      last_verified_at: nowIso,
      source: REVIEW_DEMO_SOURCE,
    });

    return Response.json({ granted: true, entitlement_id: created.id, refreshed: false, expires_at: expiresIso });
  } catch (error) {
    console.error('ensure-review-demo-entitlement error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}