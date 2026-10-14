import assert from "node:assert/strict";
import test from "node:test";
import { suggestDeposit } from "../../lib/billing/deposit-schedule.ts";

test("reference invoice: 30% + 30% + 40% including cent rounding", () => {
  const first = suggestDeposit("9904.04", [], "first30");
  assert.equal(first.proposalGross, "2971.21");
  assert.equal(first.remainingAfter, "6932.83");
  const second = suggestDeposit("9904.04", [first.proposalGross], "second30");
  assert.equal(second.proposalGross, "2971.21");
  assert.equal(second.remainingAfter, "3961.62");
  const final = suggestDeposit("9904.04", [first.proposalGross, second.proposalGross], "balance");
  assert.equal(final.proposalGross, "3961.62");
  assert.equal(final.remainingAfter, "0.00");
  assert.equal(final.kind, "final");
});
test("user-specified amount or percentage is based on original contract", () => {
  assert.equal(suggestDeposit("9904.04", ["2971.21"], "customAmount", "1500.00").proposalGross,"1500.00");
  assert.equal(suggestDeposit("9904.04", ["2971.21"], "customPercent", "20").proposalGross,"1980.81");
});
test("never invoice the same step twice or exceed contract", () => {
  assert.throws(() => suggestDeposit("9904.04", ["2971.21"], "first30"), /DEPOSIT_FIRST_ALREADY_INVOICED/);
  assert.throws(() => suggestDeposit("9904.04", [], "second30"), /DEPOSIT_SECOND_REQUIRES_FIRST/);
  assert.throws(() => suggestDeposit("9904.04", ["9000.00"], "customAmount", "905.00"), /DEPOSIT_EXCEEDS_REMAINING/);
  assert.throws(() => suggestDeposit("9904.04", [], "customPercent", "101"), /DEPOSIT_PERCENT_RANGE/);
  assert.throws(() => suggestDeposit("9904.04", ["10000.00"], "balance"), /DEPOSIT_PREVIOUS_EXCEEDS_CONTRACT/);
});
test("rounding never invents a fractional cent", () => {
  const first = suggestDeposit("0.03", [], "first30");
  assert.equal(first.proposalGross, "0.01");
  const final = suggestDeposit("0.03", ["0.01", "0.01"], "balance");
  assert.equal(final.proposalGross, "0.01");
});
