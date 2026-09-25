import Stripe from 'npm:stripe@18.5.0';
import { secrets } from 'base44:runtime';

const SUBSCRIPTION_PLANS = {
  professional_monthly: {
    name: 'Full Quarry Intelligence',
    description: 'S&S Rock Holdings membership with full quarry records, ownership, parcel, geology, permit, production, environmental, and opportunity intelligence.',
    unitAmount: 6900,
    currency: 'usd',
    interval: 'month' as const,
  },
};

// Keep every website checkout on the single canonical live Stripe price.
// This prevents a new Stripe Product/Price from being created for every checkout attempt.
const FALLBACK_STRIPE_PRICE_ID = 'price_1U4vqOHBH3xrClLV9vFwHk8r';

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
    const { plan_code, return_to, session_id, user_id, user_email, origin: bodyOrigin } = await req.json().catch(() => ({}));
    const plan = SUBSCRIPTION_PLANS[plan_code as keyof typeof SUBSCRIPTION_PLANS];
    const returnTo = cleanReturnTo(return_to);
    if (!plan) return Response.json({ error: 'Invalid plan' }, { status: 400 });

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    const publishableKey = secrets.get('STRIPE_PUBLISHABLE_KEY');
    if (!stripeKey || !publishableKey) {
      return Response.json({ error: 'Stripe checkout is not fully configured' }, { status: 503 });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
    const subscriptionPriceId = secrets.get('STRIPE_PRICE_ID_69') || FALLBACK_STRIPE_PRICE_ID;

    // Use the browser's actual origin (passed from the frontend) so Stripe
    // always redirects back to the domain the visitor started on. Fall back to
    // the request header, then the published app URL — never a marketing domain.
    const origin = String(bodyOrigin || req.headers.get('origin') || '').trim() || 'https://ssrockholdings.com';
    const browserSessionId = String(session_id || '').slice(0, 120);
    const appUserId = String(user_id || '').slice(0, 120);
    const appUserEmail = String(user_email || '').includes('@') ? String(user_email).slice(0, 160) : '';
    const signedIn = Boolean(appUserId && appUserEmail);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price: subscriptionPriceId,
        quantity: 1,
      }],
      customer_email: appUserEmail || undefined,
      client_reference_id: signedIn ? appUserId : `anonymous:${browserSessionId || randomSuffix()}`,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID") || '',
        purchase_type: 'subscription',
        checkout_flow: signedIn ? 'signed_in' : 'anonymous_web',
        user_id: signedIn ? appUserId : '',
        browser_session_id: browserSessionId,
        plan_code,
        return_to: returnTo,
      },
      subscription_data: {
        metadata: {
          base44_app_id: Deno.env.get("BASE44_APP_ID") || '',
          checkout_flow: signedIn ? 'signed_in' : 'anonymous_web',
          user_id: signedIn ? appUserId : '',
          browser_session_id: browserSessionId,
          plan_code,
          return_to: returnTo,
        },
      },
      success_url: `${origin}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}&returnTo=${encodeURIComponent(returnTo)}`,
      cancel_url: `${origin}/subscribe?checkout=cancelled&returnTo=${encodeURIComponent(returnTo)}`,
    });
    return Response.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error('create-public-subscription-checkout error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}