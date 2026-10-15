import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationChoices} from '../../lib/billing/payment-allocations.ts';
test('refund choices show fiscal references and net allocations after previous refunds',()=>{
 const allocations=[{id:'a',invoice_id:'i',amount_minor:'12000'},{id:'b',invoice_id:'j',amount_minor:'2000'}];
 assert.deepEqual(allocationChoices(allocations,[{allocation_id:'a',amount_minor:'3000'},{allocation_id:'b',amount_minor:'2000'}],[{id:'i',invoice_number:'TEST-1'},{id:'j',invoice_number:'TEST-2'}]),[{id:'a',invoice_number:'TEST-1',remaining_minor:'9000'}]);
});
test('missing scoped invoice or inconsistent ledger blocks refund choices',()=>{
 assert.throws(()=>allocationChoices([{id:'a',invoice_id:'other',amount_minor:'100'}],[],[]),/SCOPE_NOT_FOUND/);
 assert.throws(()=>allocationChoices([{id:'a',invoice_id:'i',amount_minor:'100'}],[{allocation_id:'a',amount_minor:'101'}],[{id:'i'}]),/ALLOCATION_INVALID/);
});
