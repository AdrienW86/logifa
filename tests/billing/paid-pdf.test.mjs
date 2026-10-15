import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { appendPaymentReceipt } from '../../lib/billing/paid-pdf.ts';

test('paid PDF appends a receipt without replacing or redrawing fiscal pages', async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([595, 842]).drawText('FACTURE D-20261015-4419 - ORIGINAL', { x: 40, y: 700, font });
  source.addPage([595, 842]).drawText('Prestations historiques et mentions fiscales', { x: 40, y: 700, font });
  const bytes = await source.save();
  const before = await PDFDocument.load(bytes);
  const result = await appendPaymentReceipt(bytes, { number: 'D-20261015-4419', date: '2026-10-15', method: 'Virement' });
  const after = await PDFDocument.load(result);
  assert.equal(after.getPageCount(), 3);
  for (let i = 0; i < 2; i++) {
    const a = before.getPage(i).node.Contents(), b = after.getPage(i).node.Contents();
    assert.equal(a.size(), b.size());
    for (let j = 0; j < a.size(); j++)
      assert.deepEqual(before.context.lookup(a.get(j)).getContents(), after.context.lookup(b.get(j)).getContents());
  }
  assert.equal(before.getPageCount(), 2);
});
test('malformed original is rejected rather than replaced with a new invoice', async () => {
  await assert.rejects(appendPaymentReceipt(new TextEncoder().encode('not PDF'), { number: 'N', date: '', method: '' }));
});
