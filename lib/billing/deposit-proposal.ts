import type { EditorLine } from "../../types/billing.ts";
import type { Line } from "../../types/editor.ts";
import { halfUp, moneyMinor, decimal, scaled } from "./money.ts";
import { lineTotals } from "./validation.ts";

/** Computed fiscal lines, never measurements. Caller must show and confirm the proposal. */
export function depositProposal(
  source: EditorLine[],
  input: string,
  mode: "amount" | "percent",
  reference: string,
): Line[] {
  const totals = lineTotals(source);
  if (totals.gross <= 0n) throw new Error("DEPOSIT_SOURCE_REQUIRED");
  const target =
    mode === "amount"
      ? moneyMinor(input)
      : halfUp(totals.gross * scaled(input), 10000n);
  if (target <= 0n || target > totals.gross)
    throw new Error("DEPOSIT_AMOUNT_LIMIT");
  const rates = [...totals.breakdown.entries()];
  let distributed = 0n;
  return rates.flatMap(([rate, bucket], index) => {
    const gross =
      index === rates.length - 1
        ? target - distributed
        : halfUp(target * (bucket.net + bucket.vat), totals.gross);
    distributed += gross;
    if (gross === 0n) return [];
    const net = halfUp(gross * 10000n, 10000n + BigInt(rate)),
      vat = halfUp(net * BigInt(rate), 10000n);
    if (net + vat !== gross)
      throw new Error("DEPOSIT_TAX_ROUNDING_REVIEW_REQUIRED");
    return [
      {
        key: crypto.randomUUID(),
        type: "normal",
        name: `Acompte sur ${reference} — ventilation TVA ${decimal(BigInt(rate))} %`,
        quantity: "1",
        unit: "forfait",
        price: decimal(net),
        tva: decimal(BigInt(rate)),
      },
    ];
  });
}
