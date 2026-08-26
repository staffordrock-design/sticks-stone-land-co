// functions/create-checkout-session.js
// Create a Stripe Checkout session with an optional 3-day trial. No authentication required for guest checkout.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const { email, client_reference_id } = req.body || {};

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID_199, quantity: 1 }],
      subscription_data: {
        trial_period_days: 3,
        metadata: {
          client_reference_id: client_reference_id || '',
        },
      },
      customer_email: email || undefined,
      success_url: `${process.env.APP_URL}/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/subscriptions/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
