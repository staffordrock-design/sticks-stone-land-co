// Shared Stripe → entitlement logic used by the subscription webhook function.
// Keeping it here means the checkout handler and the webhook cannot drift apart
// on what counts as a paid, active subscription.

const FULL_PLAN_CODES = new Set(['professional_monthly', 'marketplace_monthly']);

export function entitlementStatus(stripeStatus: string) {
  switch (stripeStatus) {
    case 'trialing': return 'inactive';
    case 'active': return 'active';
    case 'past_due': return 'grace_period';
    case 'canceled': return 'cancelled';
    case 'unpaid':
    case 'incomplete_expired': return 'expired';
    default: return 'inactive';
  }
}

function isoFromSeconds(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : '';
}

function subscriptionPeriodEnd(subscription: any) {
  return subscription?.current_period_end || subscription?.items?.data?.[0]?.current_period_end || null;
}

function subscriptionStart(subscription: any) {
  return subscription?.start_date || subscription?.created || null;
}

function subscriptionPriceId(subscription: any) {
  return String(subscription?.items?.data?.[0]?.price?.id || '');
}

export async function upsertWebEntitlement(base44: any, subscription: any, fallbackMetadata: any = {}) {
  const metadata = { ...(fallbackMetadata || {}), ...(subscription?.metadata || {}) };
  const userId = String(metadata.user_id || '').trim();
  const planCode = String(metadata.plan_code || '').trim();
  if (!FULL_PLAN_CODES.has(planCode)) return null;

  const subscriptionId = String(subscription?.id || '').trim();
  if (!subscriptionId) throw new Error('Stripe subscription ID missing');

  const status = entitlementStatus(String(subscription?.status || ''));
  const now = new Date().toISOString();
  // Lifecycle status controls access only. Revenue comes from paid invoices,
  // never from subscription creation, grace periods or cancellation.
  // Entitlement needs a user_id — anonymous checkouts are claimed later via
  // verify-stripe-subscription once the buyer signs in.
  if (!userId) return null;

  const data = {
    user_id: userId,
    plan_code: planCode,
    status,
    platform: 'web',
    product_id: subscriptionPriceId(subscription),
    original_transaction_id: subscriptionId,
    expires_at: isoFromSeconds(subscriptionPeriodEnd(subscription)),
    started_at: isoFromSeconds(subscriptionStart(subscription)),
    last_verified_at: now,
    source: 'Stripe verified webhook',
  };

  const existing = await base44.asServiceRole.entities.SubscriptionEntitlement.filter(
    { user_id: userId, platform: 'web', original_transaction_id: subscriptionId },
    '-updated_date',
    1,
    0,
  );

  if (existing?.[0]) {
    await base44.asServiceRole.entities.SubscriptionEntitlement.update(existing[0].id, data);
  } else {
    await base44.asServiceRole.entities.SubscriptionEntitlement.create(data);
  }

  return data;
}

export function subscriptionIdFromInvoice(invoice: any) {
  return String(
    invoice?.subscription ||
    invoice?.parent?.subscription_details?.subscription ||
    invoice?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ||
    ''
  );
}

// One record per Stripe event keyed by event id, so a retry or a duplicate
// delivery can never be applied twice.
export async function recordWebhookEvent(base44: any, data: {
  eventId: string;
  eventType: string;
  status: 'Processed' | 'Failed' | 'Ignored';
  message?: string;
  host?: string;
}) {
  try {
    const existing = await base44.asServiceRole.entities.WebhookEvent.filter(
      { provider: 'Stripe', external_event_id: data.eventId },
      '-created_date',
      1,
      0,
    );
    const now = new Date().toISOString();
    const payload = {
      provider: 'Stripe',
      external_event_id: data.eventId,
      event_type: data.eventType,
      status: data.status,
      received_at: existing?.[0]?.received_at || now,
      processed_at: data.status === 'Processed' ? now : existing?.[0]?.processed_at || '',
      error_message: String(data.message || '').slice(0, 900),
      description: `Verified delivery via ${data.host || 'unknown host'}`,
    };
    if (existing?.[0]) {
      await base44.asServiceRole.entities.WebhookEvent.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.WebhookEvent.create(payload);
    }
  } catch (error) {
    console.error('stripe webhook: event log write failed', error);
  }
}
// One immutable payment identity per invoice across checkout, webhook and reconcile.
// Zero-dollar invoices, test money and failed invoices are not paid revenue.
export async function recordPaidStripeInvoice(base44: any, invoice: any, metadata: any = {}) {
  if (invoice?.livemode !== true || invoice?.status !== 'paid' || Number(invoice?.amount_paid || 0) <= 0 || !invoice?.id) return null;
  const plan = String(metadata.plan_code || '');
  if (!FULL_PLAN_CODES.has(plan)) return null;
  const key = String(invoice.id);
  const existing = await base44.asServiceRole.entities.BillingEvent.filter({ external_transaction_id: key }, '-created_date', 1, 0);
  const paidAt = invoice?.status_transitions?.paid_at || invoice?.created;
  const data = {
    user_id: String(metadata.user_id || existing?.[0]?.user_id || ''),
    customer_email: String(invoice.customer_email || metadata.customer_email || ''),
    revenue_type: 'Subscription', plan_or_product: plan,
    amount: Number(invoice.amount_paid) / 100,
    currency: String(invoice.currency || '').toUpperCase(),
    platform: 'Stripe', status: 'Paid', external_transaction_id: key,
    occurred_at: isoFromSeconds(paidAt),
    notes: 'Verified live paid Stripe invoice. Subscription cancellation does not erase this payment.',
  };
  if (existing?.[0]) await base44.asServiceRole.entities.BillingEvent.update(existing[0].id, data);
  else await base44.asServiceRole.entities.BillingEvent.create(data);
  return data;
}
