import Stripe from 'npm:stripe@18.5.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';

const SUBSCRIPTION_PLANS = {
  professional_monthly: {
    name: 'Full Quarry Intelligence',
    description: 'S&S Rock Holdings membership with full quarry records, ownership, parcel, geology, permit, production, environmental, and opportunity intelligence.',
    unitAmount: 3900,
    currency: 'usd',
    interval: 'month' as const,
  },
};

// Reuse one $39.00 monthly Stripe price for new purchases on the existing product.
// Existing subscriptions retain their price until explicitly migrated.
const FALLBACK_STRIPE_PRICE_ID = 'price_1UO383HBH3xrClLV6PpcDgnJ';

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
    const { plan_code, return_to, session_id, user_id, user_email, email: guestEmailInput, origin: bodyOrigin } = await req.json().catch(() => ({}));
    const plan = SUBSCRIPTION_PLANS[plan_code as keyof typeof SUBSCRIPTION_PLANS];
    const returnTo = cleanReturnTo(return_to);
    if (!plan) return Response.json({ error: 'Invalid plan' }, { status: 400 });

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    const publishableKey = secrets.get('STRIPE_PUBLISHABLE_KEY');
    if (!stripeKey || !publishableKey) {
      return Response.json({ error: 'Stripe checkout is not fully configured' }, { status: 503 });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
    const lookupKey = 'ssrockholdings_professional_monthly_usd_39_00';
    const matches = await stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 1 });
    let monthlyPrice = matches.data[0];
    if (!monthlyPrice) {
      const previousPrice = await stripe.prices.retrieve(FALLBACK_STRIPE_PRICE_ID);
      const productId = typeof previousPrice.product === 'string' ? previousPrice.product : previousPrice.product.id;
      monthlyPrice = await stripe.prices.create({
        product: productId,
        currency: plan.currency,
        unit_amount: plan.unitAmount,
        recurring: { interval: plan.interval },
        lookup_key: lookupKey,
      }, { idempotencyKey: lookupKey });
    }
    if (monthlyPrice.unit_amount !== plan.unitAmount || monthlyPrice.currency !== plan.currency || monthlyPrice.recurring?.interval !== plan.interval) {
      throw new Error('The monthly subscription price is not configured correctly');
    }
    const subscriptionPriceId = monthlyPrice.id;

    // Use the browser's actual origin (passed from the frontend) so Stripe
    // always redirects back to the domain the visitor started on. Fall back to
    // the server-set X-Base44-App-Url header — never a marketing domain or
    // the request Origin header.
    const appUrl = (req.headers.get('X-Base44-App-Url') || '').trim().replace(/\/$/, '');
    const origin = String(bodyOrigin || '').trim() || appUrl;
    if (!origin) {
      return Response.json({ error: 'Could not determine the app URL for checkout redirect' }, { status: 400 });
    }
    const browserSessionId = String(session_id || '').slice(0, 120);
    const appUserId = String(user_id || '').slice(0, 120);
    const appUserEmail = String(user_email || '').includes('@') ? String(user_email).slice(0, 160) : '';
    // Guests type their email before checkout so an unfinished purchase can be recovered.
    const guestEmail = String(guestEmailInput || '').includes('@') ? String(guestEmailInput).slice(0, 160) : '';
    const buyerEmail = appUserEmail || guestEmail;
    const signedIn = Boolean(appUserId && appUserEmail);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price: subscriptionPriceId,
        quantity: 1,
      }],
      customer_email: buyerEmail || undefined,
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
    // Record the checkout start so an unpaid session can be recovered by email.
    if (buyerEmail) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AbandonedCheckout.create({
          email: buyerEmail,
          plan_code,
          stripe_session_id: session.id,
          checkout_url: session.url || '',
          amount_cents: typeof session.amount_total === 'number' ? session.amount_total : plan.unitAmount,
          currency: session.currency || plan.currency,
          status: 'started',
          buyer_type: signedIn ? 'account' : 'guest',
          user_id: signedIn ? appUserId : '',
          browser_session_id: browserSessionId,
          reminder_count: 0,
        });
      } catch (recordError) {
        console.error('AbandonedCheckout record failed:', recordError);
      }
    }

    return Response.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error('create-public-subscription-checkout error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}