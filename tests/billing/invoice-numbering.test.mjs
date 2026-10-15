import test from "node:test";
import assert from "node:assert/strict";
import { formattedInvoiceNumber, nextCounterFromExternalInvoice } from "../../lib/billing/invoice-numbering.ts";

test("September 2026 external invoice matches the historical series",()=>{
  assert.equal(formattedInvoiceNumber("2026-09-30",4418),"D-2026930-4418");
  assert.equal(nextCounterFromExternalInvoice("D-2026930-4418","2026-09-30"),4419);
});
test("October date adds the zero-free month but two-digit day",()=>{
  assert.equal(formattedInvoiceNumber("2026-10-15",4419),"D-20261015-4419");
  assert.equal(formattedInvoiceNumber("2026-01-02",22),"D-202612-0022");
});
test("reject malformed, mismatched, or impossible dates and numbers",()=>{
  assert.throws(()=>nextCounterFromExternalInvoice("D-2026930-4418","2026-10-01"),/correspond/);
  assert.throws(()=>nextCounterFromExternalInvoice("D-2026930-4418","2026-02-30"),/invalide/);
  assert.throws(()=>nextCounterFromExternalInvoice("D-2026930-0000","2026-09-30"),/limites/);
  assert.throws(()=>nextCounterFromExternalInvoice("D-2026930-9999","2026-09-30"),/limite/);
  assert.throws(()=>formattedInvoiceNumber("2026-02-30",4418),/invalide/);
  assert.throws(()=>nextCounterFromExternalInvoice("D-20260930-4418","2026-09-30"),/correspond/);
});
