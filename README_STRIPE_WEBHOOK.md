# Stripe webhook & SubscriptionEntitlement integration

This branch adds a Base44 function that handles Stripe webhooks and upserts SubscriptionEntitlement records for authenticated users. It also includes a migration to add/ensure required columns and an outline for App Store Server Notifications (ASN) that maps Apple subscriptions to the same entitlement.

Files added:
- functions/stripe-webhook.js    — Stripe webhook handler (Base44 function)
- migrations/20260826_add_subscription_entitlement_columns.sql
- docs/APP_STORE_NOTIFICATIONS.md — outline for App Store Server Notification handling
- README_STRIPE_WEBHOOK.md — setup, secrets, and test instructions

Important: DO NOT commit secrets. Add the following to Base44 secrets or your deployment environment before enabling the webhook:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_ID_199 (optional; fallback is present in code)

Default webhook path: /functions/stripe-webhook

---

See the code for more details and the TODOs where you should wire the Base44 DB client functions for upsert and lookup.
