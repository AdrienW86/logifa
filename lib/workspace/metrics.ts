import type { Row } from "./client";
export function financialMetrics(
  invoices: Row[],
  payments: Row[],
  balances: Record<string, Row>,
) {
  let billed = 0n,
    received = 0n,
    remaining = 0n,
    unpaid = 0;
  for (const invoice of invoices) {
    if (invoice.lifecycle === "draft") continue;
    const balance = balances[String(invoice.id)];
    if (!balance) throw new Error("Solde serveur manquant.");
    const gross = BigInt(String(balance.gross_minor ?? 0)),
      deductions = BigInt(String(balance.deductions_minor ?? 0));
    if (invoice.document_kind === "credit") billed -= gross;
    else {
      billed += gross - deductions;
      const due = BigInt(String(balance.remaining_minor ?? 0));
      remaining += due;
      if (due > 0n) unpaid++;
    }
  }
  for (const payment of payments)
    received +=
      (payment.direction === "refund" ? -1n : 1n) *
      BigInt(String(payment.amount_minor));
  return { billed, received, remaining, unpaid };
}
