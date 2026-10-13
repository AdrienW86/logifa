import {
  moneyMinor,
  scaled,
  halfUp,
  decimal,
  MAX_MINOR,
} from "../billing/money.ts";

const amount = "(\\d+(?:[ \\u00a0\\u202f]\\d{3})*(?:[.,]\\d{1,2})?)";
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const cleanAmount = (value: string) =>
  value
    .trim()
    .replace(/\s*(?:€|euros?|EUR)\s*(?:HT)?$/iu, "")
    .replace(/\s+HT$/iu, "")
    .replace(/[ \u00a0\u202f]/g, "")
    .replace(",", ".");
export const displayDecimal = (value: string) => {
  const [whole, fraction] = value.split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
    (fraction && Number(fraction) ? "," + fraction : "")
  );
};

/** An entire, single attributed statement is required; a budget or shared total is insufficient. */
export function attributedTotal(
  prompt: string,
  name: string,
  quantity: string,
  unit: string,
  total: string,
  quote: unknown,
  unitQuote: unknown,
) {
  if (/\b(?:budget|global|général|ensemble|plusieurs|total)\b/iu.test(name))
    return false;
  if (
    typeof quote !== "string" ||
    !prompt.includes(quote) ||
    typeof unitQuote !== "string" ||
    !prompt.includes(unitQuote) ||
    !quote.includes(unitQuote)
  )
    return false;
  if (
    !prompt
      .split(/\r?\n|;/)
      .some(
        (statement) =>
          statement.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "") ===
          quote.trim(),
      )
  )
    return false;
  const prefix = `^${escape(name)}\\s*(?:[:—-]\\s*)?\\(?(\\d+(?:[.,]\\d+)?)\\s*${escape(unit)}\\)?\\s*[,—:]?\\s*`;
  const patterns = [
    `${prefix}(?:pour|[=:—-]|total(?:\\s+HT)?\\s*[:=]?)\\s*${amount}\\s*(?:€|euros?|EUR)\\s*HT[.]?$`,
    `${prefix}(?:pour\\s+(?:un\\s+)?)?(?:montant\\s+)?total\\s+HT\\s*(?:de|[:=])?\\s*${amount}\\s*(?:€|euros?|EUR)[.]?$`,
  ];
  const match = patterns
    .map((pattern) => quote.trim().match(new RegExp(pattern, "iu")))
    .find(Boolean);
  if (!match) return false;
  return (
    scaled(cleanAmount(match[1]), 6) === scaled(quantity, 6) &&
    moneyMinor(cleanAmount(match[2])) === moneyMinor(total) &&
    unitQuote.includes(unit)
  );
}

export function unitFromTotal(total: string, quantity: string) {
  const q = scaled(quantity, 6);
  if (q <= 0n) throw new Error("QUANTITY_REQUIRED");
  const minor = moneyMinor(total);
  const pu = halfUp(minor * 1000000n, q);
  if (pu > MAX_MINOR) throw new Error("AMOUNT_LIMIT");
  const rebuilt = halfUp(pu * q, 1000000n);
  const difference = pu * q - minor * 1000000n;
  const abs = difference < 0n ? -difference : difference;
  const fraction = (abs % 1000000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  const delta = `${difference < 0n ? "-" : ""}${abs / 1000000n}${fraction ? "." + fraction : ""}`;
  return {
    price: decimal(pu),
    total: decimal(minor),
    rebuilt: decimal(rebuilt),
    exact: difference === 0n,
    deltaMinor: delta,
  };
}

export function declaredDocumentTotal(
  prompt: string,
  value: unknown,
  quote: unknown,
) {
  if (
    typeof value !== "string" ||
    typeof quote !== "string" ||
    !prompt.includes(quote)
  )
    return undefined;
  const match = quote
    .trim()
    .match(
      new RegExp(
        `^Total\\s+(?:HT\\s+du\\s+devis|général\\s+HT)\\s*[:=]\\s*${amount}\\s*(?:€|euros?|EUR)[.]?$`,
        "iu",
      ),
    );
  if (!match) return undefined;
  const minor = moneyMinor(cleanAmount(value));
  return moneyMinor(cleanAmount(match[1])) === minor ? minor : undefined;
}
