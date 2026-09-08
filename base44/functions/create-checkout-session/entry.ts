// functions/create-checkout-session.js
// Create a Stripe Checkout session for the $39/month subscription. No authentication required for guest checkout.

import Stripe from 'npm:stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const { email, client_reference_id } = req.body || {};

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: 3900,
          recurring: { interval: 'month' },
          product_data: { name: 'S&S Rock Holdings — Full Quarry Intelligence' },
        },
        quantity: 1,
      }],
      subscription_data: {
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
