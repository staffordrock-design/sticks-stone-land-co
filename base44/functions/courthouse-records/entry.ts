import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ---------------------------------------------------------------------------
// courthouse-records
//
// DeedRecord / PlatRecord / SurveyRecord are admin-only entities. This is the
// controlled data path for the Courthouse Records page: it first verifies the
// caller is an entitled subscriber or an admin, then reads and writes those
// entities with the service role so admin RLS is never exposed to subscribers.
//
// Records created here are ALWAYS verification_status "derived" — never
// "verified" — because this data is extracted from documents, not verified by
// a person against the chain of title.
// ---------------------------------------------------------------------------

const FULL_QUARRY_PLANS = new Set(['professional_monthly', 'marketplace_monthly']);
const ACTIVE_STATUSES = new Set(['active', 'grace_period']);
const DOCUMENT_TYPES = new Set(['deed', 'mineral_deed', 'oil_gas_lease', 'deed_of_trust', 'plat', 'other']);
const DEED_FIELDS = [
  'state', 'county', 'document_type', 'book', 'page', 'instrument_number', 'recording_date',
  'grantors', 'grantees', 'parcel_ids', 'acreage', 'consideration', 'legal_description',
  'prior_deed_reference', 'prior_book', 'prior_page', 'mineral_severance', 'minerals_reserved',
  'oil_gas_language', 'mineral_clause_text', 'document_file_url', 'notes',
];
const SURVEY_FIELDS = ['county', 'state', 'parcel_id', 'surveyor_name', 'survey_date', 'document_file_url', 'notes'];
const MAX_LIMIT = 200;
const MAX_PARCEL_TERMS = 8;

function text(value) {
  return String(value ?? '').trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseLimit(value, fallback = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function entitlementCurrent(row) {
  if (!row) return false;
  if (!ACTIVE_STATUSES.has(text(row.status))) return false;
  if (!FULL_QUARRY_PLANS.has(text(row.plan_code))) return false;
  if (!row.expires_at) return true;
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires > Date.now();
}

async function authorize(base44) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return { ok: false, status: 401, error: 'Sign in to use Courthouse Records' };
  if (user.role === 'admin') return { ok: true };
  const rows = await base44.asServiceRole.entities.SubscriptionEntitlement
    .filter({ user_id: user.id }, '-updated_date', 20)
    .catch(() => []);
  if (!(rows || []).some(entitlementCurrent)) {
    return { ok: false, status: 403, error: 'Full Quarry Intelligence subscription required' };
  }
  return { ok: true };
}

function parcelTermsFrom(...sources) {
  const terms = [];
  for (const source of sources) {
    for (const part of text(source).split(',')) {
      const value = text(part);
      if (value && !terms.includes(value)) terms.push(value);
    }
  }
  return terms.slice(0, MAX_PARCEL_TERMS);
}

function regexExact(value) {
  return { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
}

function regexContains(value) {
  return { $regex: escapeRegex(value), $options: 'i' };
}

// Uses only the operators the data layer supports ($regex / $options / $or).
// (grantors OR grantees) AND every other supplied condition, expressed as an
// $or of branches that each carry the other conditions.
function buildSearchFilter(body) {
  const others = {};
  const county = text(body?.county);
  if (county) others.county = regexExact(county);
  const parcelId = text(body?.parcel_id);
  if (parcelId) others.parcel_ids = regexContains(parcelId);
  const book = text(body?.book);
  if (book) others.book = regexExact(book);
  const page = text(body?.page);
  if (page) others.page = regexExact(page);

  const name = text(body?.name);
  if (!name) return others;
  const nameRegex = regexContains(name);
  return {
    $or: [
      { ...others, grantors: nameRegex },
      { ...others, grantees: nameRegex },
    ],
  };
}

function byRecordingDate(a, b) {
  const ta = Date.parse(a?.recording_date || '');
  const tb = Date.parse(b?.recording_date || '');
  const va = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY;
  const vb = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY;
  return va - vb;
}

function linkKey(book, page) {
  const b = text(book).toLowerCase();
  const p = text(page).toLowerCase();
  return b && p ? `${b}|${p}` : null;
}

async function collectChain(svc, deedId, parcelId) {
  const deeds = new Map();
  const add = (rows) => (rows || []).forEach((row) => { if (row?.id) deeds.set(row.id, row); });

  let seed = null;
  if (deedId) seed = await svc.entities.DeedRecord.get(deedId).catch(() => null);
  if (seed?.id) deeds.set(seed.id, seed);

  for (const term of parcelTermsFrom(parcelId, seed?.parcel_ids)) {
    const rows = await svc.entities.DeedRecord
      .filter({ parcel_ids: regexContains(term) }, '-recording_date', MAX_LIMIT)
      .catch(() => []);
    add(rows);
  }

  // Walk prior-deed book/page links in both directions until the chain closes.
  for (let pass = 0; pass < 2; pass += 1) {
    const keys = new Set();
    for (const deed of deeds.values()) {
      const own = linkKey(deed.book, deed.page);
      const prior = linkKey(deed.prior_book, deed.prior_page);
      if (own) keys.add(own);
      if (prior) keys.add(prior);
    }
    const branches = [];
    for (const key of [...keys].slice(0, 40)) {
      const [book, page] = key.split('|');
      branches.push({ book: regexExact(book), page: regexExact(page) });
      branches.push({ prior_book: regexExact(book), prior_page: regexExact(page) });
    }
    if (!branches.length) break;
    const before = deeds.size;
    add(await svc.entities.DeedRecord.filter({ $or: branches }, '-recording_date', MAX_LIMIT).catch(() => []));
    if (deeds.size === before) break;
  }

  return [...deeds.values()].sort(byRecordingDate);
}

function sanitizeDeed(input) {
  const out = {};
  for (const field of DEED_FIELDS) {
    const value = input?.[field];
    out[field] = value === undefined || value === '' ? null : value;
  }
  out.state = text(out.state) || 'TN';
  if (out.document_type && !DOCUMENT_TYPES.has(text(out.document_type))) out.document_type = 'other';
  out.verification_status = 'derived';
  return out;
}

function sanitizeSurvey(input) {
  const out = {};
  for (const field of SURVEY_FIELDS) {
    const value = input?.[field];
    out[field] = value === undefined || value === '' ? null : value;
  }
  out.state = text(out.state) || 'TN';
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const operation = text(body?.operation);

    const access = await authorize(base44);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

    const svc = base44.asServiceRole;

    if (operation === 'search') {
      const rows = await svc.entities.DeedRecord
        .filter(buildSearchFilter(body), '-recording_date', parseLimit(body?.limit))
        .catch(() => []);
      return Response.json({ deeds: rows || [] });
    }

    if (operation === 'chain') {
      const deedId = text(body?.deed_id);
      const parcelId = text(body?.parcel_id);
      if (!deedId && !parcelId) {
        return Response.json({ error: 'A deed_id or parcel_id is required' }, { status: 400 });
      }
      const deeds = await collectChain(svc, deedId, parcelId);
      const terms = parcelTermsFrom(parcelId, ...deeds.map((deed) => deed.parcel_ids));
      const [plats, surveys] = terms.length
        ? await Promise.all([
            svc.entities.PlatRecord.filter({ $or: terms.map((term) => ({ parcel_ids: regexContains(term) })) }, '-recording_date', 100).catch(() => []),
            svc.entities.SurveyRecord.filter({ $or: terms.map((term) => ({ parcel_id: regexExact(term) })) }, '-survey_date', 100).catch(() => []),
          ])
        : [[], []];
      return Response.json({ deeds, plats: plats || [], surveys: surveys || [] });
    }

    if (operation === 'create_deed') {
      const record = await svc.entities.DeedRecord.create(sanitizeDeed(body?.deed));
      return Response.json({ record });
    }

    if (operation === 'create_survey') {
      const record = await svc.entities.SurveyRecord.create(sanitizeSurvey(body?.survey));
      return Response.json({ record });
    }

    return Response.json({ error: 'Unsupported operation' }, { status: 400 });
  } catch (error) {
    console.error('courthouse-records failed:', error);
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}