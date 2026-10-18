import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Enterprise data-licensing endpoint. A buyer presents a license_key; the
// function validates the license and returns records ONLY from the tables
// named in that license's licensed_tables field, among the three supported
// tables (MiningSite, USGSMineralOccurrence, Listing). The function runs with
// service-role access so buyers never need direct entity access — raw entity
// endpoints stay admin-only.

const SUPPORTED_TABLES = ['MiningSite', 'USGSMineralOccurrence', 'Listing'];
const PER_TABLE_LIMIT = 500;

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const license_key = String(body?.license_key || '').trim();
    const requestedTable = body?.table != null ? String(body.table).trim() : '';

    if (!license_key) {
      return Response.json({ error: 'license_key is required.' }, { status: 400 });
    }

    // (a) Look up the DataLicense record by license_key.
    const licenseRows = await svc.entities.DataLicense.filter({ license_key }, '-updated_date', 1);
    const license = (licenseRows || [])[0];

    // (b) Reject if no record found.
    if (!license) {
      return Response.json({ error: 'No data license found for the provided license_key.' }, { status: 404 });
    }

    // (b) Reject if status is not 'active'.
    if (String(license.status || '').toLowerCase() !== 'active') {
      return Response.json({ error: `Data license is ${license.status || 'not active'} and cannot be used.` }, { status: 403 });
    }

    // (b) Reject if expires_at is in the past.
    if (license.expires_at) {
      const expires = new Date(String(license.expires_at));
      if (!isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
        return Response.json({ error: 'Data license has expired.' }, { status: 403 });
      }
    }

    // (c) Parse the tables this license grants access to.
    const licensedTables = String(license.licensed_tables || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    // (d) Determine which tables to return.
    let tablesToReturn: string[];
    if (requestedTable) {
      if (!SUPPORTED_TABLES.includes(requestedTable)) {
        return Response.json({ error: `Table '${requestedTable}' is not a supported data table.` }, { status: 400 });
      }
      if (!licensedTables.includes(requestedTable)) {
        return Response.json({ error: `Table '${requestedTable}' is not included in this data license.` }, { status: 403 });
      }
      tablesToReturn = [requestedTable];
    } else {
      tablesToReturn = SUPPORTED_TABLES.filter((t) => licensedTables.includes(t));
      if (tablesToReturn.length === 0) {
        return Response.json({ error: 'This data license does not grant access to any supported tables.' }, { status: 403 });
      }
    }

    // Read each requested table with service-role access. Buyers never touch
    // the raw (admin-only) entity endpoints directly.
    const tableReaders: Record<string, () => Promise<any[]>> = {
      MiningSite: () => svc.entities.MiningSite.filter({}, '-updated_date', PER_TABLE_LIMIT),
      USGSMineralOccurrence: () => svc.entities.USGSMineralOccurrence.filter({}, '-updated_date', PER_TABLE_LIMIT),
      Listing: () => svc.entities.Listing.filter({}, '-updated_date', PER_TABLE_LIMIT),
    };

    const data: Record<string, any> = {};
    await Promise.all(tablesToReturn.map(async (t) => {
      try {
        data[t] = await tableReaders[t]();
      } catch (err: any) {
        data[t] = { error: String(err?.message || err || 'Failed to read table.') };
      }
    }));

    return Response.json({
      license: {
        company_name: license.company_name,
        status: license.status,
        expires_at: license.expires_at,
        licensed_tables: licensedTables,
      },
      tables: tablesToReturn,
      data,
    });
  } catch (error: any) {
    console.error('get-licensed-data error:', error);
    return Response.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}