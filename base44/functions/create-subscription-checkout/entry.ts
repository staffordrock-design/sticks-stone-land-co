import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

const SUBSCRIPTION_PLANS = {
  professional_monthly: {
    name: 'S&S Rock Holdings — Full Quarry Intelligence',
    unitAmount: 19900,
    currency: 'usd',
    interval: 'month' as const,
  },
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
    const { plan_code, return_to } = await req.json();
    const plan = SUBSCRIPTION_PLANS[plan_code as keyof typeof SUBSCRIPTION_PLANS];
    const returnTo = typeof return_to === 'string' && return_to.startsWith('/') && !return_to.startsWith('//') && !return_to.startsWith('/subscribe')
      ? return_to
      : '/';
    if (!plan) return Response.json({ error: 'Invalid plan' }, { status: 400 });

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

    const origin = req.headers.get('origin') || 'https://ssrockholdings.com';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: plan.currency,
          unit_amount: plan.unitAmount,
          recurring: { interval: plan.interval },
          product_data: { name: plan.name },
        },
        quantity: 1,
      }],
      customer_email: user.email,
      client_reference_id: user.id,
      integration_identifier: `ssrockholdings_${randomSuffix()}`,
      metadata: { purchase_type: 'subscription', user_id: user.id, plan_code, return_to: returnTo },
      subscription_data: {
        trial_period_days: 3,
        metadata: { user_id: user.id, plan_code, return_to: returnTo },
      },
      success_url: `${origin}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}&returnTo=${encodeURIComponent(returnTo)}`,
      cancel_url: `${origin}/subscribe?checkout=cancelled&returnTo=${encodeURIComponent(returnTo)}`,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error('create-subscription-checkout error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
