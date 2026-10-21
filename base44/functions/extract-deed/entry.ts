import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ---------------------------------------------------------------------------
// extract-deed
//
// Reads an uploaded deed / courthouse document (PDF, scanned image, or HTML)
// with the app's built-in file-extraction integration and returns ONE
// structured object whose keys match the DeedRecord entity exactly.
//
// The result is ALWAYS machine-derived: verification_status is forced to
// "derived" and document_file_url echoes the caller's file_url. Any field the
// document does not contain is returned as null — nothing is inferred.
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES = ['deed', 'mineral_deed', 'oil_gas_lease', 'deed_of_trust', 'plat', 'other'];

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    state: { type: 'string', description: 'Two-letter US state code of the recording jurisdiction, e.g. TN. null if the document does not state it.' },
    county: { type: 'string', description: 'County where the document was recorded. null if not stated.' },
    document_type: { type: 'string', enum: DOCUMENT_TYPES, description: 'The kind of recorded document.' },
    book: { type: 'string', description: 'Recording deed/book number, e.g. "123".' },
    page: { type: 'string', description: 'Recording page number, e.g. "456".' },
    instrument_number: { type: 'string', description: 'Instrument / document number assigned by the register of deeds.' },
    recording_date: { type: 'string', description: 'Date the document was recorded, formatted YYYY-MM-DD.' },
    grantors: { type: 'string', description: 'Grantor(s) / party of the first part, exactly as printed.' },
    grantees: { type: 'string', description: 'Grantee(s) / party of the second part, exactly as printed.' },
    parcel_ids: { type: 'string', description: 'County map/parcel identification numbers for the property, comma-separated.' },
    acreage: { type: 'number', description: 'Acreage conveyed, numeric only (e.g. 42.5). null if not stated.' },
    consideration: { type: 'number', description: 'Consideration / purchase price in dollars, numeric only. null if not stated.' },
    legal_description: { type: 'string', description: 'The full legal description of the property as written in the document.' },
    prior_deed_reference: { type: 'string', description: 'Verbatim "being the same property conveyed by" / prior-deed clause text. null if none.' },
    prior_book: { type: 'string', description: 'Book number of the prior deed reference, if stated.' },
    prior_page: { type: 'string', description: 'Page number of the prior deed reference, if stated.' },
    mineral_severance: { type: 'boolean', description: 'true if minerals are severed from the surface estate by this document; false if there is mineral language but no severance; null if the document has no mineral language at all.' },
    minerals_reserved: { type: 'boolean', description: 'true if the grantor expressly reserves minerals; false if there is mineral language but nothing is reserved; null if there is no mineral language.' },
    oil_gas_language: { type: 'boolean', description: 'true if the document contains oil and/or gas lease, pooling, or oil/gas mineral language; false otherwise; null if there is no such language.' },
    mineral_clause_text: { type: 'string', description: 'The EXACT verbatim clause text concerning minerals (severance, reservation, or oil & gas), copied word-for-word. null if none.' },
    notes: { type: 'string', description: 'Any other notable annotation directly relevant to this deed. null if none.' },
  },
  required: [],
};

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(text)) return true;
  if (['false', 'no', 'n', '0'].includes(text)) return false;
  return null;
}

function normalizeDocumentType(value) {
  const text = cleanString(value);
  if (!text) return null;
  const key = text.toLowerCase().replace(/[\s\-/]+/g, '_');
  if (DOCUMENT_TYPES.includes(key)) return key;
  if (key.includes('oil') && key.includes('gas')) return 'oil_gas_lease';
  if (key.includes('mineral')) return 'mineral_deed';
  if (key.includes('trust')) return 'deed_of_trust';
  if (key.includes('plat')) return 'plat';
  if (key.includes('deed')) return 'deed';
  return 'other';
}

function parseIsoDate(value) {
  const text = cleanString(value);
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const fileUrl = typeof body?.file_url === 'string' ? body.file_url.trim() : '';
    if (!fileUrl) {
      return Response.json({ error: 'file_url is required' }, { status: 400 });
    }

    const result = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url: fileUrl,
      json_schema: EXTRACTION_SCHEMA,
    });

    if (result?.status === 'error') {
      console.error('extract-deed extraction error:', result?.details);
      return Response.json({ error: result?.details || 'Could not read the deed document' }, { status: 422 });
    }

    const raw = Array.isArray(result?.output) ? (result.output[0] || {}) : (result?.output || {});

    const deed = {
      state: cleanString(raw.state),
      county: cleanString(raw.county),
      document_type: normalizeDocumentType(raw.document_type),
      book: cleanString(raw.book),
      page: cleanString(raw.page),
      instrument_number: cleanString(raw.instrument_number),
      recording_date: parseIsoDate(raw.recording_date),
      grantors: cleanString(raw.grantors),
      grantees: cleanString(raw.grantees),
      parcel_ids: cleanString(raw.parcel_ids),
      acreage: parseNumber(raw.acreage),
      consideration: parseNumber(raw.consideration),
      legal_description: cleanString(raw.legal_description),
      prior_deed_reference: cleanString(raw.prior_deed_reference),
      prior_book: cleanString(raw.prior_book),
      prior_page: cleanString(raw.prior_page),
      mineral_severance: parseBoolean(raw.mineral_severance),
      minerals_reserved: parseBoolean(raw.minerals_reserved),
      oil_gas_language: parseBoolean(raw.oil_gas_language),
      mineral_clause_text: cleanString(raw.mineral_clause_text),
      document_file_url: fileUrl,
      verification_status: 'derived',
      notes: cleanString(raw.notes),
    };

    return Response.json(deed);
  } catch (error) {
    console.error('extract-deed failed:', error);
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}