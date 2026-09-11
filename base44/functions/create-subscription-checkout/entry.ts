import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe';
import { secrets } from 'base44:runtime';

const SUBSCRIPTION_PLANS = {
  professional_monthly: {
    name: 'S&S Rock Holdings — Full Quarry Intelligence',
    unitAmount: 4900,
    currency: 'usd',
    interval: 'month' as const,
  },
};

function randomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function cleanReturnTo(value: unknown) {
  const returnTo = typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/subscribe')
    ? value
    : '/';
  return returnTo;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const { plan_code, return_to, session_id } = await req.json().catch(() => ({}));
    const plan = SUBSCRIPTION_PLANS[plan_code as keyof typeof SUBSCRIPTION_PLANS];
    const returnTo = cleanReturnTo(return_to);
    if (!plan) return Response.json({ error: 'Invalid plan' }, { status: 400 });

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

    const origin = req.headers.get('origin') || 'https://ssrockholdings.com';
    const browserSessionId = String(session_id || '').slice(0, 120);
    const appUserId = user?.id ? String(user.id) : '';
    const appUserEmail = user?.email ? String(user.email) : '';
    const successTarget = appUserId ? '/subscribe' : '/register';
    const attachUrl = `/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}&returnTo=${encodeURIComponent(returnTo)}`;

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
      customer_email: appUserEmail || undefined,
      client_reference_id: appUserId || `anonymous:${browserSessionId || randomSuffix()}`,
      integration_identifier: `ssrockholdings_${randomSuffix()}`,
      metadata: {
        purchase_type: 'subscription',
        checkout_flow: appUserId ? 'signed_in' : 'anonymous_web',
        user_id: appUserId,
        browser_session_id: browserSessionId,
        plan_code,
        return_to: returnTo,
      },
      subscription_data: {
        metadata: {
          checkout_flow: appUserId ? 'signed_in' : 'anonymous_web',
          user_id: appUserId,
          browser_session_id: browserSessionId,
          plan_code,
          return_to: returnTo,
        },
      },
      success_url: `${origin}${successTarget}?checkout=success&session_id={CHECKOUT_SESSION_ID}&returnTo=${encodeURIComponent(attachUrl)}`,
      cancel_url: `${origin}/subscribe?checkout=cancelled&returnTo=${encodeURIComponent(returnTo)}`,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error('create-subscription-checkout error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
