import { createClientFromRequest } from 'npm:@base44/sdk';
import Stripe from 'npm:stripe@23.0.1';
import { secrets } from 'base44:runtime';
import { recordPaidStripeInvoice, upsertWebEntitlement, subscriptionIdFromInvoice } from '../../shared/stripeEntitlement.ts';

// Repairs app records only. Never creates charges, changes prices or cancels a subscription.
export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });
    const key = secrets.get('STRIPE_SECRET_KEY');
    if (!key) return Response.json({ error: 'Live Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(key);
    let starting_after: string | undefined;
    let checked = 0, recorded = 0, hasMore = false;
    const since = Math.floor(Date.now() / 1000) - 90 * 86400;
    do {
      const page = await stripe.invoices.list({ status: 'paid', created: { gte: since }, limit: 100, ...(starting_after ? { starting_after } : {}) });
      hasMore = page.has_more;
      for (const invoice of page.data) {
        checked++;
        const subId = subscriptionIdFromInvoice(invoice);
        if (!subId || invoice.livemode !== true) continue;
        const subscription = await stripe.subscriptions.retrieve(subId);
        const data = await recordPaidStripeInvoice(base44, invoice, subscription.metadata);
        if (data) {
          recorded++;
          await upsertWebEntitlement(base44, subscription);
        }
      }
      starting_after = page.data.at(-1)?.id;
      if (!starting_after) break;
    } while (hasMore && checked < 1000);
    return Response.json({ checked, recorded, days: 90, truncated: hasMore, note: 'App ledger reconciled from live paid invoices. Owner/internal payments are excluded from customer funnel reporting.' });
  } catch (error) {
    return Response.json({ error: error?.message || 'Reconciliation failed' }, { status: 500 });
  }
}
