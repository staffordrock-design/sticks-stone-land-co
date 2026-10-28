import Stripe from 'npm:stripe@18.5.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';

// Give buyers an hour to finish on their own before a reminder goes out.
const MIN_AGE_MINUTES = 60;
// Bounded so one run can never fire a burst of email.
const MAX_PER_RUN = 25;
const APP_ORIGIN = 'https://ssrockholdings.com';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

    const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000).toISOString();
    const page: any = await base44.asServiceRole.entities.AbandonedCheckout.filter(
      { status: 'started', created_date: { $lte: cutoff } },
      { sort: 'created_date', limit: MAX_PER_RUN },
    );
    const rows: any[] = page?.items || (Array.isArray(page) ? page : []);

    const summary = { checked: 0, sent: 0, recovered: 0, skipped: 0, failed: 0, results: [] as any[] };

    for (const row of rows) {
      summary.checked += 1;
      const email = String(row.email || '').trim();
      if (!email || !email.includes('@')) {
        summary.skipped += 1;
        continue;
      }

      let session: any = null;
      try {
        session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
      } catch (stripeError) {
        console.error('Recovery session lookup failed', row.stripe_session_id, stripeError?.message);
      }

      // Never message a merchant self-test session.
      if (session?.metadata?.base44_test_checkout === 'true') {
        await base44.asServiceRole.entities.AbandonedCheckout.update(row.id, {
          status: 'dismissed',
          note: 'Excluded: Base44 self-test checkout.',
        });
        summary.skipped += 1;
        continue;
      }

      // They finished paying after all — no email, just close the record.
      if (session && (session.payment_status === 'paid' || session.status === 'complete')) {
        await base44.asServiceRole.entities.AbandonedCheckout.update(row.id, {
          status: 'recovered',
          note: 'Payment completed before recovery email.',
        });
        summary.recovered += 1;
        continue;
      }

      // Resume the same Stripe page while it is still open; otherwise send them
      // back to the subscribe page, which starts a fresh session at the same price.
      const resumeUrl = session?.status === 'open' && session?.url ? session.url : `${APP_ORIGIN}/subscribe`;

      const sendResult: any = await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        template_name: 'CheckoutRecovery',
        category: 'marketing',
        variables: {
          plan_price: '$39/month',
          cta_url: resumeUrl,
        },
      }).catch((sendError: any) => ({ success: false, message: sendError?.message || 'send failed' }));

      if (sendResult?.success === false || sendResult?.error) {
        await base44.asServiceRole.entities.AbandonedCheckout.update(row.id, {
          status: 'email_failed',
          note: `Send blocked: ${sendResult?.reason || sendResult?.message || sendResult?.error || 'unknown'}`.slice(0, 900),
        });
        summary.failed += 1;
        continue;
      }

      await base44.asServiceRole.entities.AbandonedCheckout.update(row.id, {
        status: 'email_sent',
        email_sent_at: new Date().toISOString(),
        resume_url: resumeUrl,
        reminder_count: Number(row.reminder_count || 0) + 1,
      });
      summary.sent += 1;
    }

    return Response.json(summary);
  } catch (error: any) {
    console.error('send-abandoned-checkout-recovery error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}