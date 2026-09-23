import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Public endpoint: accepts seller/property-owner lead submissions without
// requiring an S&S account. Service role bypasses the QuarryLeadIntake RLS
// (which normally requires data.user_id === {{user.id}}) so anonymous property
// owners can submit their information before creating an account.

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));

    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim();
    if (!name || !email) {
      return Response.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    const lead = await svc.entities.QuarryLeadIntake.create({
      lead_type: 'Seller',
      name,
      email,
      phone: String(body?.phone || '').trim() || null,
      state: String(body?.state || '').trim(),
      county: String(body?.county || '').trim(),
      acreage: body?.acreage ? Number(body.acreage) : null,
      asset_type: String(body?.property_type || '').trim(),
      commodity: String(body?.commodity || '').trim(),
      description: String(body?.consideration || '').trim(),
      status: 'New',
      source: 'Sell Property Page',
      user_id: '',
    });

    return Response.json({ success: true, lead_id: lead.id });
  } catch (error) {
    console.error('submit-seller-lead error:', error);
    return Response.json({ error: error?.message || 'Could not submit lead.' }, { status: 500 });
  }
}