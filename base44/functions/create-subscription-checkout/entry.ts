import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

const PRICE_IDS: Record<string, string> = {
  marketplace_monthly: 'price_1U4vqOHBH3xrClLV9vFwHk8r',
  marketplace_annual: 'price_1U4vqYHBH3xrClLVmXss2arI',
  professional_monthly: 'price_1U4vqZHBH3xrClLVvnE0N1Le',
  professional_annual: 'price_1U4vqaHBH3xrClLVJ5aUGec0',
};

function randomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id || !user?.email) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const { plan_code } = await req.json();
    const priceId = PRICE_IDS[plan_code];
    if (!priceId) return Response.json({ error: 'Invalid plan' }, { status: 400 });

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || !price.recurring) return Response.json({ error: 'Subscription price unavailable' }, { status: 503 });

    const origin = req.headers.get('origin') || 'https://ssrockholdings.com';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      integration_identifier: `ssrockholdings_${randomSuffix()}`,
      metadata: { purchase_type: 'subscription', user_id: user.id, plan_code },
      subscription_data: { metadata: { user_id: user.id, plan_code } },
      success_url: `${origin}/subscribe?checkout=success`,
      cancel_url: `${origin}/subscribe?checkout=cancelled`,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error('create-subscription-checkout error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
