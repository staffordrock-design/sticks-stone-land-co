import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Public endpoint: accepts enterprise/company inquiries without requiring an
// S&S account. Service role bypasses RLS so anonymous visitors can submit.
// Stores the inquiry in SalesLead and queues an owner notification via
// NotificationQueue (reusing the app's existing notification pattern).

const OWNER_EMAIL = 'contact@ssrockholdings.com';
// Only the Enterprise page's own source labels are accepted. Anything else
// (including a missing value) falls back to the general enterprise-page source.
const ALLOWED_SOURCES = new Set(['Enterprise Page', 'Enterprise Page — Workup', 'Homepage Lead Form']);

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim();
    const company = String(body?.company || '').trim();
    const message = String(body?.message || '').trim().slice(0, 2000);
    const phone = String(body?.phone || '').trim().slice(0, 40);
    const interestType = String(body?.interestType || '').trim().slice(0, 120);
    const requestedSource = String(body?.source || '').trim();
    const source = ALLOWED_SOURCES.has(requestedSource) ? requestedSource : 'Enterprise Page';

    if (!name || !email || !message || name.length > 120 || email.length > 254 || company.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Please enter a valid name, email, and inquiry.' }, { status: 400 });
    }

    const lead = await svc.entities.SalesLead.create({
      name,
      email,
      company: company || null,
      interest: message,
      notes: `${source}\n${interestType ? `Inquiry: ${interestType}\n` : ''}${phone ? `Phone: ${phone}\n` : ''}${message}`,
      source,
      status: 'New',
      created_at: new Date().toISOString(),
    });

    // Notify the site owner through the app's notification queue.
    try {
      await svc.entities.NotificationQueue.create({
        notification_type: 'Buyer Interest',
        recipient_email: OWNER_EMAIL,
        subject: `New ${source === 'Homepage Lead Form' ? 'homepage lead' : 'enterprise inquiry'} — ${company || name}`,
        message: `Name: ${name}\nCompany: ${company || '—'}\nEmail: ${email}\nPhone: ${phone || '—'}\nInterest: ${interestType || '—'}\nSource: ${source}\n\n${message}`,
        status: 'Queued',
        related_entity_type: 'SalesLead',
        related_entity_id: lead.id,
        queued_at: new Date().toISOString(),
      });
    } catch (notifyErr) {
      console.error('Enterprise inquiry owner notification failed', notifyErr);
    }

    return Response.json({ success: true, lead_id: lead.id });
  } catch (error) {
    console.error('submit-enterprise-inquiry error:', error);
    return Response.json({ error: error?.message || 'Could not submit inquiry.' }, { status: 500 });
  }
}