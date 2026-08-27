// functions/stripe-webhook.js
// Stripe webhook handler for Base44 functions
// - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
// - Maps Stripe price IDs to internal plan keys and upserts SubscriptionEntitlement
// - Uses STRIPE_PRICE_ID_199 if set in environment, otherwise falls back to the provided price ID
// - Does NOT include any secret values; keep STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Base44 secrets

import Stripe from 'npm:stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map Stripe price IDs to your internal plan keys (static mappings)
const PRICE_MAP = {
  'price_1U4vqOHBH3xrClLV9vFwHk8r': 'quarry.monthly',
  'price_1U4vqYHBH3xrClLVmXss2arI': 'quarry.annual',
  'price_1U4vqZHBH3xrClLVvnE0N1Le': 'professional.monthly',
  'price_1U4vqaHBH3xrClLVJ5aUGec0': 'professional.annual',
};

// Dynamic $199 price: prefer env var, fall back to the price ID you provided
const FALLBACK_PRICE_199 = 'price_1U8mh3HBH3xrClLVT3w37VcC';
const PRICE_ID_199 = process.env.STRIPE_PRICE_ID_199 || FALLBACK_PRICE_199;
PRICE_MAP[PRICE_ID_199] = 'premium.199';

// Default webhook path: /functions/stripe-webhook
// NOTE: Replace db.* calls with your Base44 DB client implementation.

async function upsertSubscriptionEntitlement({ userId, plan, stripeSubscriptionId, stripePriceId, status, currentPeriodEnd, lastPaymentAt }) {
  if (!userId) return null;

  // TODO: Replace this pseudo-code with your actual Base44 DB client code.
  // The function should upsert (insert or update) a SubscriptionEntitlement row for the given userId.
  // Required columns we expect: user_id, plan, stripe_subscription_id, stripe_price_id, status, current_period_end, last_payment_at, updated_at
  // Example (pseudo):
  // return await db.upsert('SubscriptionEntitlement', { user_id: userId }, { plan, stripe_subscription_id: stripeSubscriptionId, ... });

  // Example placeholder implementation that assumes a `db` global exists. Replace with real code.
  if (typeof db !== 'undefined' && db.upsertSubscriptionEntitlement) {
    return await db.upsertSubscriptionEntitlement({
      user_id: userId,
      plan,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_price_id: stripePriceId,
      status,
      current_period_end: currentPeriodEnd,
      last_payment_at: lastPaymentAt,
      updated_at: new Date(),
    });
  }

  // If no db client is present, log and return the prepared object for debugging.
  console.warn('No DB client implemented for upsertSubscriptionEntitlement. Replace placeholder with your DB client.');
  return { userId, plan, stripeSubscriptionId, stripePriceId, status, currentPeriodEnd, lastPaymentAt };
}

async function findUserIdByStripeCustomerId(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  // TODO: Replace with actual DB lookup that returns the user id for a given stripe_customer_id
  if (typeof db !== 'undefined' && db.findUserIdByStripeCustomerId) {
    return await db.findUserIdByStripeCustomerId(stripeCustomerId);
  }
  console.warn('No DB client implemented for findUserIdByStripeCustomerId.');
  return null;
}

async function findUserIdByStripeSubscriptionId(stripeSubscriptionId) {
  if (!stripeSubscriptionId) return null;
  if (typeof db !== 'undefined' && db.findUserIdByStripeSubscriptionId) {
    return await db.findUserIdByStripeSubscriptionId(stripeSubscriptionId);
  }
  console.warn('No DB client implemented for findUserIdByStripeSubscriptionId.');
  return null;
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature'];
  let rawBody;

  try {
    rawBody = new TextDecoder().decode(await req.arrayBuffer());
  } catch (err) {
    console.error('Failed to read raw request body', err);
    return res.status(400).send('Invalid request body');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const obj = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const session = obj;
      const stripeCustomerId = session.customer;
      let userId = null;

      if (session.metadata && session.metadata.user_id) userId = session.metadata.user_id;
      if (!userId && session.client_reference_id) userId = session.client_reference_id;
      if (!userId && stripeCustomerId) userId = await findUserIdByStripeCustomerId(stripeCustomerId);

      if (session.subscription && userId) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items.data[0]?.price?.id || null;
        const plan = PRICE_MAP[priceId] || null;
        await upsertSubscriptionEntitlement({
          userId,
          plan,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
          lastPaymentAt: null,
        });
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = obj;
      const stripeCustomerId = subscription.customer;
      const userId = await findUserIdByStripeCustomerId(stripeCustomerId);
      const priceId = subscription.items.data[0]?.price?.id || null;
      const plan = PRICE_MAP[priceId] || null;
      await upsertSubscriptionEntitlement({
        userId,
        plan,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        lastPaymentAt: null,
      });
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = obj;
      const stripeCustomerId = subscription.customer;
      const userId = await findUserIdByStripeCustomerId(stripeCustomerId);
      await upsertSubscriptionEntitlement({
        userId,
        plan: null,
        stripeSubscriptionId: subscription.id,
        stripePriceId: null,
        status: 'canceled',
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        lastPaymentAt: null,
      });
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = obj;
      const stripeSubscriptionId = invoice.subscription;
      const userId = await findUserIdByStripeSubscriptionId(stripeSubscriptionId);
      if (stripeSubscriptionId && userId) {
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const priceId = subscription.items.data[0]?.price?.id || null;
        const plan = PRICE_MAP[priceId] || null;
        await upsertSubscriptionEntitlement({
          userId,
          plan,
          stripeSubscriptionId,
          stripePriceId: priceId,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
          lastPaymentAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date(),
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook', err);
    res.status(500).send('Server error');
  }
}
