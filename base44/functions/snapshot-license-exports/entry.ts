import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Quarterly scheduled function. On each run it snapshots the licensed tables
// for every active DataLicense (status = 'active', no past expires_at) to a
// CSV and records one DataExportJob per license. Only the three supported
// tables (MiningSite, USGSMineralOccurrence, Listing) are ever exported, and
// only those named in the license's licensed_tables field.
//
// File upload from a scheduled function is attempted via the Core
// UploadPublicFile integration; if that is not possible from this runtime,
// the CSV content reference is recorded in notes and file_url is left empty,
// with a clear statement of what was not possible.

const SUPPORTED_TABLES = ['MiningSite', 'USGSMineralOccurrence', 'Listing'];
const PER_TABLE_LIMIT = 500;

function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function recordsToCsv(records: any[]): string {
  if (!records || records.length === 0) return '';
  const headers: string[] = [];
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!headers.includes(k)) headers.push(k);
    }
  }
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of records) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

function quarterLabel(date: Date): string {
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${q} ${date.getUTCFullYear()}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export default async function(req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const now = new Date();
    const runTime = now.toISOString();
    const quarter = quarterLabel(now);
    const expiresAt = addDays(now, 90).toISOString();

    // Active licenses only. Service role bypasses the admin-only DataLicense RLS.
    const licenses = await svc.entities.DataLicense.filter({ status: 'active' }, '-updated_date', 500);

    const tableReaders: Record<string, () => Promise<any[]>> = {
      MiningSite: () => svc.entities.MiningSite.filter({}, '-updated_date', PER_TABLE_LIMIT),
      USGSMineralOccurrence: () => svc.entities.USGSMineralOccurrence.filter({}, '-updated_date', PER_TABLE_LIMIT),
      Listing: () => svc.entities.Listing.filter({}, '-updated_date', PER_TABLE_LIMIT),
    };

    const results: any[] = [];
    for (const license of licenses || []) {
      // Skip licenses whose expires_at is in the past.
      if (license.expires_at) {
        const exp = new Date(String(license.expires_at));
        if (!isNaN(exp.getTime()) && exp.getTime() < now.getTime()) {
          results.push({ license_key: license.license_key, skipped: 'expired' });
          continue;
        }
      }

      const licensedTables = String(license.licensed_tables || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const tablesToExport = SUPPORTED_TABLES.filter((t) => licensedTables.includes(t));

      if (tablesToExport.length === 0) {
        results.push({ license_key: license.license_key, skipped: 'no supported tables' });
        continue;
      }

      // Build a combined CSV with one section per licensed table.
      const sections: string[] = [];
      const counts: Record<string, number> = {};
      for (const t of tablesToExport) {
        let rows: any[] = [];
        try {
          rows = await tableReaders[t]();
        } catch {
          rows = [];
        }
        counts[t] = (rows || []).length;
        sections.push(`[table: ${t}]\n${recordsToCsv(rows)}`);
      }
      const csvContent = sections.join('\n\n');
      const fileName = `license-${license.license_key}-${quarter.replace(' ', '')}.csv`;

      // Attempt to upload the CSV from the scheduled function to PRIVATE
      // storage — the export is paid enterprise data, so it must not be public.
      // UploadPrivateFile returns a file_uri (not a URL); a signed URL must be
      // generated via CreateFileSignedUrl to actually download the file.
      let fileUri = '';
      let uploadNote = '';
      try {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const file = new File([blob], fileName, { type: 'text/csv' });
        const upload = await svc.integrations.Core.UploadPrivateFile({ file });
        fileUri = upload?.file_uri || '';
      } catch (uploadErr: any) {
        uploadNote = `CSV upload from scheduled function was not possible: ${String(uploadErr?.message || uploadErr || 'unknown error')}. `;
      }

      const notes = `${quarter} data-license snapshot for ${license.company_name || ''} (key: ${license.license_key}). Tables: ${tablesToExport.join(', ')}. Row counts: ${Object.entries(counts).map(([t, c]) => `${t}=${c}`).join(', ')}. ${uploadNote}${fileUri ? 'CSV stored privately (file_uri recorded in file_url); generate a signed URL via CreateFileSignedUrl to download.' : 'CSV content was generated in-function but not uploaded; regenerate on demand via get-licensed-data with this license_key.'}`;

      try {
        await svc.entities.DataExportJob.create({
          user_id: license.license_key,
          export_type: 'Custom',
          status: fileUri ? 'Ready' : 'Failed',
          requested_at: runTime,
          ready_at: fileUri ? now.toISOString() : '',
          expires_at: expiresAt,
          file_url: fileUri,
          notes,
        });
        results.push({ license_key: license.license_key, tables: tablesToExport, counts, file_uri: fileUri || null, uploaded: Boolean(fileUri) });
      } catch (createErr: any) {
        results.push({ license_key: license.license_key, error: String(createErr?.message || createErr || 'Failed to create DataExportJob') });
      }
    }

    return Response.json({ run_at: runTime, quarter, licenses_processed: (licenses || []).length, results });
  } catch (error) {
    console.error('snapshot-license-exports error:', error);
    return Response.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}