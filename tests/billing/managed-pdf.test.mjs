import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { loadService } from '../helpers/load-service.mjs';
const mocks = {
  '/services/workspace': 'export const scopedRecord = async () => state.invoice;',
  '/supabase/server': 'export const databaseForAdmin = async () => state.db;',
  '/services/billing': 'export const checkedRpc = async () => {state.balanceReads++; return state.balance;}; export const persistenceError = e => new Error(e.message);',
  '/services/archive': 'export const verifiedPdf = async () => { state.reads++; return state.original; }; export const archivePdf = async () => ({});',
};
function database(original = true) {
  const tables = { document_files: original ? { id: 'original-file' } : null, deposit_deductions: [], payment_allocations: [], allocation_reversals: [], payments: [] };
  return { from(table) {
    if (!(table in tables)) throw new Error(`Unexpected read: ${table}`);
    const query = { select: () => query, eq: () => query, in: () => query, maybeSingle: () => query, then: resolve => Promise.resolve({ data: tables[table], error: null }).then(resolve) };
    return query;
  } };
}
async function fixture(original = true) {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const state = { invoice: { lifecycle: 'issued', invoice_number: 'TEST-4419' }, db: database(original), balance: { is_acquittable: true }, original: await pdf.save(), reads: 0, balanceReads: 0 };
  const loaded = await loadService('lib/services/managed-pdf.ts', state, mocks);
  return { ...loaded, state };
}
test('issued GET serves the exact archive without rereading mutable data or balances', async () => {
  const f = await fixture(); try {
    assert.deepEqual(await f.module.managedInvoiceBytes('invoice', 'issuer'), f.state.original);
    assert.equal(f.state.reads, 1); assert.equal(f.state.balanceReads, 0);
  } finally { await f.cleanup(); }
});
test('paid variant requires current full-payment confirmation and an original', async () => {
  const f = await fixture(); try {
    f.state.balance.is_acquittable = false;
    await assert.rejects(f.module.managedInvoiceBytes('invoice', 'issuer', true), /NOT_FULLY_PAID/);
    assert.equal(f.state.reads, 0);
    f.state.balance.is_acquittable = true;
    const result = await f.module.managedInvoiceBytes('invoice', 'issuer', true);
    assert.equal((await PDFDocument.load(result)).getPageCount(), 2);
    f.state.invoice.lifecycle = 'draft';
    await assert.rejects(f.module.managedInvoiceBytes('invoice', 'issuer', true), /ISSUED_INVOICE_REQUIRED/);
  } finally { await f.cleanup(); }
  const missing = await fixture(false); try {
    await assert.rejects(missing.module.managedInvoiceBytes('invoice', 'issuer', true), /ORIGINAL_ARCHIVE_REQUIRED/);
  } finally { await missing.cleanup(); }
});
