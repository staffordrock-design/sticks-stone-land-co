import Stripe from 'npm:stripe';
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
    if (!stripeKey) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

    // Use the browser's actual origin (passed from the frontend) so Stripe
    // always redirects back to the domain the visitor started on. Fall back to
    // the request header, then the published app URL — never a marketing domain.
    const origin = String(bodyOrigin || req.headers.get('origin') || '').trim() || 'https://industrious-stone-strata-site.base44.app';
    const browserSessionId = String(session_id || '').slice(0, 120);
    const appUserId = String(user_id || '').slice(0, 120);
    const appUserEmail = String(user_email || '').includes('@') ? String(user_email).slice(0, 160) : '';
    const signedIn = Boolean(appUserId && appUserEmail);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      branding_settings: {
        display_name: 'S&S Rock Holdings',
        background_color: '#ffffff',
        button_color: '#0369a1',
        border_style: 'rounded',
        font_family: 'inter',
        logo: {
          type: 'url',
          url: 'https://media.base44.com/images/public/6a78376a454093ba2f431acd/7de99d026_logo.png/v1/fill/w_1200,h_630/7de99d026_logo.png',
        },
      },
      custom_text: {
        submit: {
          message: 'Need help? Email contact@ssrockholdings.com or visit https://ssrockholdings.com/support',
        },
      },
      line_items: [{
        price_data: {
          currency: plan.currency,
          unit_amount: plan.unitAmount,
          recurring: { interval: plan.interval },
          product_data: {
            name: plan.name,
            description: plan.description,
            images: ['https://media.base44.com/images/public/6a78376a454093ba2f431acd/7de99d026_logo.png/v1/fill/w_1200,h_630/7de99d026_logo.png'],
          },
        },
        quantity: 1,
      }],
      customer_email: appUserEmail || undefined,
      client_reference_id: signedIn ? appUserId : `anonymous:${browserSessionId || randomSuffix()}`,
      integration_identifier: `ssrockholdings_${randomSuffix()}`,
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
      checkout_url: session.url || '',
      session_id: session.id,
    });
  } catch (error) {
    console.error('create-public-subscription-checkout error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}