import assert from "node:assert/strict";
import test from "node:test";
import { depositProposal } from "../../lib/billing/deposit-proposal.ts";
import { lineTotals } from "../../lib/billing/validation.ts";

const works = [
  {type:"normal",name:"Chantier et fourniture",quantity:"1",unit:"forfait",price:"9904.04",tva:"0"},
];
test("actual invoice PDF: suggested first and second 30% gross amounts",()=>{
  const first=depositProposal(works,"30","percent","D-202683-5432");
  const second=depositProposal(works,"2971.21","amount","D-202683-5432");
  assert.equal(first.length,1);
  assert.equal(first[0].price,"2971.21");
  assert.equal(second[0].price,"2971.21");
  assert.equal(lineTotals(first).gross,297121n);
  assert.equal(lineTotals(second).gross,297121n);
});
test("proposed deposit cannot exceed source contract",()=>{
  assert.throws(()=>depositProposal(works,"9904.05","amount","SOURCE"),/DEPOSIT_AMOUNT_LIMIT/);
  assert.throws(()=>depositProposal(works,"0","percent","SOURCE"),/DEPOSIT_AMOUNT_LIMIT/);
});
test("a missing VAT category must never be assumed",()=>{
  assert.throws(()=>depositProposal([{...works[0],tva:""}],"30","percent","SOURCE"),/DECIMAL_REQUIRED/);
});
