import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Public endpoint: accepts due-diligence / research requests without requiring
// an S&S account. Service role bypasses RLS so anonymous visitors can submit
// research requests before creating an account.

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
      lead_type: 'Report Request',
      name,
      email,
      phone: String(body?.phone || '').trim() || null,
      company: String(body?.company || '').trim() || null,
      property_name: String(body?.property_name || '').trim(),
      state: String(body?.state || '').trim(),
      county: String(body?.county || '').trim(),
      target_states: String(body?.target_states || '').trim(),
      target_counties: String(body?.target_counties || '').trim(),
      target_commodities: String(body?.target_commodities || '').trim(),
      asset_preferences: String(body?.research_objective || '').trim(),
      acquisition_timing: String(body?.time_frame || '').trim(),
      description: String(body?.deliverable || '').trim(),
      status: 'New',
      source: 'Due Diligence Request Page',
      user_id: '',
    });

    return Response.json({ success: true, lead_id: lead.id });
  } catch (error) {
    console.error('submit-due-diligence-request error:', error);
    return Response.json({ error: error?.message || 'Could not submit request.' }, { status: 500 });
  }
}