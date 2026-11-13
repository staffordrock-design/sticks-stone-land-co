import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Only authenticated app admins and the verified S&S owner identities may
// read or modify private lead data. Never trust a role or email from the body.
const OWNER_EMAILS = new Set([
  'staffordrock@icloud.com',
  'xtchz7fj6n@privaterelay.appleid.com',
]);
const VALID_STAGES = {
  SalesLead: new Set(['New', 'Contacted', 'Qualified', 'Customer', 'Closed']),
  QuarryLeadIntake: new Set(['New', 'Reviewing', 'Contacted', 'Qualified', 'Deal', 'Connected', 'Closed']),
};

export default async function(req: Request) {
  try {
    const client = createClientFromRequest(req);
    const viewer = await client.auth.me().catch(() => null);
    const email = String(viewer?.email || '').trim().toLowerCase();
    if (!viewer?.id || (viewer.role !== 'admin' && !OWNER_EMAILS.has(email))) {
      return Response.json({ error: 'Owner/admin sign-in required.' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const service = client.asServiceRole;

    if (body?.action === 'list') {
      const [quarryLeads, salesLeads] = await Promise.all([
        service.entities.QuarryLeadIntake.list('-created_at', 500),
        service.entities.SalesLead.list('-created_at', 500),
      ]);
      return Response.json({
        success: true,
        quarryLeads: Array.isArray(quarryLeads) ? quarryLeads : [],
        salesLeads: Array.isArray(salesLeads) ? salesLeads : [],
      });
    }

    if (body?.action === 'update') {
      const entityName = String(body?.entityName || '');
      const leadId = String(body?.leadId || '');
      const status = String(body?.status || '');
      if (!Object.prototype.hasOwnProperty.call(VALID_STAGES, entityName)
          || !/^[a-f\d]{24}$/i.test(leadId)
          || !(entityName === 'SalesLead' ? VALID_STAGES.SalesLead : VALID_STAGES.QuarryLeadIntake).has(status)) {
        return Response.json({ error: 'Invalid lead or stage.' }, { status: 400 });
      }
      const changed = entityName === 'SalesLead'
        ? await service.entities.SalesLead.update(leadId, { status })
        : await service.entities.QuarryLeadIntake.update(leadId, { status });
      return Response.json({ success: true, id: changed?.id || leadId, status });
    }

    return Response.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (err) {
    console.error('owner-lead-inbox error', err);
    return Response.json({ error: 'Could not access the private lead inbox.' }, { status: 500 });
  }
}