import { isRecord } from "../editor/contracts";
import { text, uuid, validateDraft } from "../billing/validation";
import type { DraftInput, EditorLine } from "../../types/billing";

export function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("INPUT_OBJECT_REQUIRED");
  return value;
}
export function field(
  value: Record<string, unknown>,
  key: string,
  optional = false,
): string {
  const item = value[key];
  if (optional && (item === undefined || item === null || item === ""))
    return "";
  if (typeof item !== "string") throw new Error(`INPUT_${key.toUpperCase()}`);
  return text(item, 10000);
}
export function id(value: Record<string, unknown>, key: string): string {
  return uuid(field(value, key));
}
export function optionalId(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const item = field(value, key, true);
  return item ? uuid(item) : undefined;
}
export function documentInput(raw: unknown): DraftInput {
  const value = object(raw);
  if (!Array.isArray(value.lines)) throw new Error("LINES_REQUIRED");
  const lines: EditorLine[] = value.lines.map((rawLine) => {
    const line = object(rawLine),
      name = field(line, "name");
    if (line.type === "title") return { type: "title", name };
    const unit = field(line, "unit");
    if (line.type !== "normal" || !isUnit(unit))
      throw new Error("LINE_INVALID");
    return {
      type: "normal",
      name,
      unit,
      quantity: field(line, "quantity"),
      price: field(line, "price"),
      tva: field(line, "tva"),
    };
  });
  const kind = value.document_kind ?? "classic";
  if (
    kind !== "classic" &&
    kind !== "deposit" &&
    kind !== "final" &&
    kind !== "credit"
  )
    throw new Error("INVOICE_KIND");
  return validateDraft({
    issuer_profile_id: id(value, "issuer_profile_id"),
    client_id: id(value, "client_id"),
    project_id: optionalId(value, "project_id"),
    quote_id: optionalId(value, "quote_id"),
    correction_of: optionalId(value, "correction_of"),
    credit_reason: field(value, "credit_reason", true) || undefined,
    document_kind: kind,
    lines,
  });
}
function isUnit(
  value: string,
): value is "m²" | "ml" | "unité" | "forfait" | "m³" {
  return ["m²", "ml", "unité", "forfait", "m³"].includes(value);
}
export function requireConfirmation(value: Record<string, unknown>) {
  if (value.confirmed !== true) throw new Error("HUMAN_CONFIRMATION_REQUIRED");
}
