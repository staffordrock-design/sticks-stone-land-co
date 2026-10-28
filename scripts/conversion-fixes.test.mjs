import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { selectSummaryPermit, ownershipStatusLabel } from '../src/lib/sourceInterpretation.js';

async function loadTs(path, extra = '', prefix = '') {
  const source = fs.readFileSync(path, 'utf8').replace(/^import[^;]+;\s*/gm, '');
  const result = ts.transpileModule(prefix + source + extra, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, path);
  return import('data:text/javascript;base64,' + Buffer.from(result.outputText).toString('base64'));
}
const billing = [];
const access = [];
const entity = rows => ({
  filter: async query => rows.filter(r => Object.entries(query).every(([k,v]) => r[k] === v)),
  create: async data => { const row = { ...data, id: String(rows.length + 1) }; rows.push(row); return row; },
  update: async (id, data) => Object.assign(rows.find(r => r.id === id), data),
});
const base44 = { asServiceRole: { entities: { BillingEvent: entity(billing), SubscriptionEntitlement: entity(access) } } };
const ledger = await loadTs('base44/shared/stripeEntitlement.ts');
const metadata = { plan_code: 'professional_monthly', user_id: 'buyer' };
const invoice = { id: 'in_paid', livemode: true, status: 'paid', amount_paid: 3900, currency: 'usd', created: 1793000000, customer_email: 'buyer@example.com' };
await ledger.recordPaidStripeInvoice(base44, invoice, metadata);
await ledger.recordPaidStripeInvoice(base44, invoice, metadata);
assert.equal(billing.length, 1, 'duplicate invoice retries must not add a second payment');
assert.equal(billing[0].amount, 39);
await ledger.recordPaidStripeInvoice(base44, invoice, { plan_code: 'professional_monthly' });
assert.equal(billing[0].user_id, 'buyer', 'guest webhook must preserve claimed buyer');
for (const bad of [{ ...invoice, id: 'in_test', livemode: false }, { ...invoice, id: 'in_zero', amount_paid: 0 }, { ...invoice, id: 'in_failed', status: 'open' }]) await ledger.recordPaidStripeInvoice(base44, bad, metadata);
assert.equal(billing.length, 1, 'test, zero-dollar and unpaid invoices are not revenue');
const subscription = { id: 'sub_paid', metadata, status: 'canceled', current_period_end: 1795000000, items: { data: [{ price: { id: 'price_39' } }] } };
await ledger.upsertWebEntitlement(base44, subscription);
assert.equal(billing[0].status, 'Paid', 'cancellation cannot erase payment');
assert.equal(access[0].status, 'cancelled');
await ledger.upsertWebEntitlement(base44, { ...subscription, status: 'active' });
assert.equal(billing.length, 1, 'active lifecycle alone must not create revenue');
assert.equal(access[0].status, 'active');

const active = { permit_number: 'TN_ACTIVE', status: 'Active', permitted_acres: 175.6, last_source_update: '2026-10-13' };
const pending = { permit_number: 'TN_PENDING', status: 'Pending', permitted_acres: 110, last_source_update: '2026-10-23' };
assert.equal(selectSummaryPermit([pending, active], { tdec_permit_number: 'TN_ACTIVE' }), active);
assert.equal(selectSummaryPermit([]), null);
assert.match(ownershipStatusLabel({ status: 'Parcel Matched - No Owner' }, 'ROGERS GROUP INC'), /another linked source/);
assert.match(ownershipStatusLabel({ status: 'Verified' }, 'OWNER'), /^Verified/);

const funnel = await loadTs('base44/functions/get-conversion-funnel/entry.ts', '\nexport { emptyMetrics, addRecordToMetrics, summarizeMetrics, isQualified };');
const metrics = funnel.emptyMetrics();
funnel.addRecordToMetrics(metrics, { session_id: 's1', resource_id: 'store_product_loaded', path: '/subscribe' });
assert.equal(funnel.summarizeMetrics(metrics).checkout_started_total, 0, 'loading product is not opening checkout');
funnel.addRecordToMetrics(metrics, { session_id: 's1', resource_id: 'store_purchase_sheet_opening', path: '/subscribe' });
funnel.addRecordToMetrics(metrics, { session_id: 's1', resource_id: 'checkout_created', path: '/subscribe' });
assert.equal(funnel.summarizeMetrics(metrics).checkout_started_total, 1, 'same session counts once across checkout platforms');
funnel.addRecordToMetrics(metrics, { session_id: 's1', resource_id: 'store_confirmation_returned', path: '/subscribe' });
assert.equal(funnel.summarizeMetrics(metrics).backend_verification_succeeded, 0, 'sheet return is not server verification');
funnel.addRecordToMetrics(metrics, { session_id: 's1', resource_id: 'checkout_completed', path: '/subscribe' });
assert.equal(funnel.summarizeMetrics(metrics).paid_subscribers, 0, 'client event alone cannot create paid customer or revenue');
assert.equal(funnel.summarizeMetrics(metrics, billing).revenue, 39);
assert.equal(funnel.isQualified({ user_role: 'admin' }), false);
assert.equal(funnel.isQualified({ user_agent: 'HeadlessChrome' }), false);
assert.equal(funnel.isQualified({ user_id: '6a83be5a6f033f818145ab59' }), false);
assert.equal(funnel.isQualified({ user_email: 'buyer@example.com', user_agent: 'Safari' }), true);

const calls = [];
const publicClient = { asServiceRole: { entities: new Proxy({}, { get: (_, name) => ({
  get: async () => ({ id: 'site1', state: 'TN', county: 'Putnam', parcel_id: 'P1', msha_mine_id: 'M1', mine_name: 'Example', parcel_owner: 'SECRET OWNER' }),
  filter: async query => { calls.push({ name, query }); if (name === 'GeologyRecord') throw new Error('unavailable'); return name === 'ParcelRecord' ? [{}] : []; },
}) }) } };
globalThis.__publicClient = publicClient;
const pub = await loadTs('base44/functions/get-public-site/entry.ts', '', 'const createClientFromRequest = () => globalThis.__publicClient;\n');
const response = await pub.default(new Request('https://example.com', { method: 'POST', body: JSON.stringify({ mining_site_id: 'site1' }) }));
const data = await response.json();
assert.equal(data.coverage.parcel, true);
assert.equal(data.coverage.geology, null, 'lookup failure is unknown, not missing');
assert.equal(data.coverage.permits, false);
assert.equal(JSON.stringify(data).includes('SECRET OWNER'), false, 'coverage preview must not leak premium owner values');
assert.deepEqual(calls.find(c => c.name === 'DeedRecord').query, { state: 'TN', county: 'Putnam', parcel_ids: 'P1' });

const changedTs = ['verify-stripe-subscription','verify-public-stripe-subscription','stripe-subscription-webhook','reconcile-subscription-payments','get-sample-site'];
for (const name of changedTs) {
  const result = ts.transpileModule(fs.readFileSync('base44/functions/' + name + '/entry.ts', 'utf8'), { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, name);
}
console.log('PASS: invoice deduplication, cancellation, payment qualification, permit selection, ownership labels, funnel classification, public coverage privacy and backend syntax.');
