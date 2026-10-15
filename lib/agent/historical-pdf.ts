import { exactLineTotals } from "../billing/validation.ts";
export type HistoricalPdfLine = {
  type: "normal" | "title";
  name: string;
  quantity: string;
  unit: string;
  price: string;
  tva: string;
  evidence: string;
};
export type HistoricalPdfExtraction = {
  lines: HistoricalPdfLine[];
  warnings: string[];
  totals: { net: string; vat: string; gross: string };
};

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// Use nullable fields, never coerce a missing price, quantity or VAT to zero.
export const historicalPdfSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines", "total_net", "total_vat", "total_gross", "warnings"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "quantity", "unit", "price", "vat_rate", "evidence"],
        properties: {
          type: { type: "string", enum: ["normal", "title"] },
          name: { type: "string" },
          quantity: { type: ["string", "null"] },
          unit: { type: ["string", "null"] },
          price: { type: ["string", "null"] },
          vat_rate: { type: ["string", "null"] },
          evidence: { type: "string" },
        },
      },
    },
    total_net: { type: ["string", "null"] },
    total_vat: { type: ["string", "null"] },
    total_gross: { type: ["string", "null"] },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

function decimal(raw: unknown, signed = false): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  return (signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(v) ? v : "";
}
function unit(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim().toLowerCase();
  if (["m²", "m2"].includes(v)) return "m²";
  if (["ml", "m.l", "m.l."].includes(v)) return "ml";
  if (["u", "unité", "unités", "unite", "pcs"].includes(v)) return "unité";
  if (["forfait", "fft"].includes(v)) return "forfait";
  if (["m³", "m3"].includes(v)) return "m³";
  return "";
}
function compareMoney(a: string, b: unknown): boolean {
  return a !== "" && typeof b !== "undefined" && b !== null &&
    Number.isFinite(Number(b)) &&
    Math.abs(Number(a) - Number(b)) <= 0.02;
}
export function validatedHistoricalPdf(
  raw: unknown,
  expected?: { net?: unknown; vat?: unknown; gross?: unknown },
): HistoricalPdfExtraction {
  if (!object(raw) || !Array.isArray(raw.lines) || raw.lines.length > 120 ||
    !Array.isArray(raw.warnings) || raw.warnings.length > 60)
    throw new Error("PDF_EXTRACTION_INVALID");
  if (!raw.warnings.every((w) => typeof w === "string" && w.length <= 500))
    throw new Error("PDF_EXTRACTION_INVALID");
  const warnings = [...raw.warnings] as string[];
  const lines: HistoricalPdfLine[] = [];
  for (const [index, item] of raw.lines.entries()) {
    if (!object(item) || !["normal", "title"].includes(String(item.type)) ||
      typeof item.name !== "string" || !item.name.trim() || item.name.length > 1000 ||
      typeof item.evidence !== "string" || item.evidence.length > 1000)
      throw new Error("PDF_EXTRACTION_INVALID");
    const name = item.name.trim();
    if (item.type === "title") {
      lines.push({ type: "title", name, quantity: "", price: "", tva: "", unit: "", evidence: item.evidence });
      continue;
    }
    const quantity = decimal(item.quantity);
    const price = decimal(item.price, true);
    const tva = decimal(item.vat_rate);
    const u = unit(item.unit);
    if (!quantity || Number(quantity) <= 0 || !price || !tva || Number(tva) > 100 || !u)
      warnings.push("Ligne " + (index + 1) + " (« " + name.slice(0, 60) + " ») : quantité, unité, prix HT ou TVA à vérifier et compléter.");
    lines.push({ type: "normal", name, quantity, unit: u, price, tva, evidence: item.evidence });
  }
  if (!lines.some((line) => line.type === "normal"))
    throw new Error("PDF_EXTRACTION_NO_LINES");
  const totals = {
    net: decimal(raw.total_net),
    vat: decimal(raw.total_vat),
    gross: decimal(raw.total_gross),
  };
  if (expected) {
    for (const [key, label] of [["net", "HT"], ["vat", "TVA"], ["gross", "TTC"]] as const) {
      if (!compareMoney(totals[key], expected[key]))
        warnings.push("Total " + label + " extrait absent ou différent du total enregistré : vérification obligatoire.");
    }
  }
  const complete = lines.filter((line) =>
    line.type === "normal" && line.quantity && line.price && line.tva && line.unit);
  const subtotal = complete.reduce((sum, line) => {
    try {return sum + exactLineTotals(line.quantity,line.price,line.tva).net;}
    catch {warnings.push("Montants extraits hors limites : vérification obligatoire.");return sum;}
  },0n);
  if (totals.net && complete.length === lines.filter((line) => line.type === "normal").length &&
    Math.abs(Number(subtotal) - Number(totals.net) * 100) > 3)
    warnings.push("La somme des lignes extraites ne correspond pas au total HT du devis : vérifiez les prix et quantités.");
  return { lines, warnings: [...new Set(warnings)].slice(0, 90), totals };
}
