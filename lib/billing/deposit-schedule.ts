import { decimal, halfUp, moneyMinor, scaled } from "./money.ts";

export type DepositStep = "first30" | "second30" | "balance" | "customPercent" | "customAmount";

/**
 * Suggestions only, never invoices or payments. Percentages apply to the
 * original contract gross, not to the declining balance.
 */
export function suggestDeposit(
  contractGross: string,
  previousIssuedGross: readonly string[],
  step: DepositStep,
  value = "",
) {
  const contract = moneyMinor(contractGross);
  if (contract <= 0n) throw new Error("DEPOSIT_CONTRACT_REQUIRED");
  const previous = previousIssuedGross.map(moneyMinor);
  const alreadyInvoiced = previous.reduce((sum, current) => sum + current, 0n);
  if (alreadyInvoiced > contract) throw new Error("DEPOSIT_PREVIOUS_EXCEEDS_CONTRACT");
  const remainingBefore = contract - alreadyInvoiced;
  if (remainingBefore === 0n) throw new Error("DEPOSIT_CONTRACT_FULLY_INVOICED");

  let requested: bigint;
  if (step === "first30") {
    if (previous.length !== 0) throw new Error("DEPOSIT_FIRST_ALREADY_INVOICED");
    requested = halfUp(contract * 30n, 100n);
  } else if (step === "second30") {
    if (previous.length !== 1) throw new Error("DEPOSIT_SECOND_REQUIRES_FIRST");
    requested = halfUp(contract * 30n, 100n);
  } else if (step === "balance") {
    requested = remainingBefore;
  } else if (step === "customPercent") {
    const pct = scaled(value);
    if (pct <= 0n || pct > 10000n) throw new Error("DEPOSIT_PERCENT_RANGE");
    requested = halfUp(contract * pct, 10000n);
  } else if (step === "customAmount") {
    requested = moneyMinor(value);
  } else {
    throw new Error("DEPOSIT_STEP_INVALID");
  }
  if (requested <= 0n || requested > remainingBefore) throw new Error("DEPOSIT_EXCEEDS_REMAINING");
  return {
    contractGross: decimal(contract),
    alreadyInvoiced: decimal(alreadyInvoiced),
    remainingBefore: decimal(remainingBefore),
    proposalGross: decimal(requested),
    remainingAfter: decimal(remainingBefore - requested),
    count: previous.length,
    kind: step === "balance" ? "final" as const : "deposit" as const,
  };
}
