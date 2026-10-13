import type {
  AgentProposal,
  EditorDraft,
  ClientFields,
  Line,
  PaymentNote,
} from "../../types/editor";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const clientKeys = [
  "name",
  "street",
  "cityZip",
  "phone",
  "email",
  "workAddress",
];
const lineKeys = ["name", "quantity", "unit", "price", "tva"];
function strings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === "string");
}
function isClient(value: unknown): value is ClientFields {
  return isRecord(value) && strings(value, clientKeys);
}
function isLine(value: unknown): value is Line {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    (value.type === "normal" || value.type === "title") &&
    strings(value, lineKeys)
  );
}
function isPaymentNote(value: unknown): value is PaymentNote {
  return isRecord(value) && strings(value, ["key", "amount", "date", "method"]);
}
/** Structural checks precede semantic/date/amount checks in the editor model. */
export function isDraftShape(value: unknown): value is EditorDraft {
  if (isRecord(value) && value.fiscal !== undefined) {
    const fiscal = value.fiscal;
    if (
      !isRecord(fiscal) ||
      !["operationDate", "dueDate", "purchaseOrder", "operationCategory"].every(
        (key) => typeof fiscal[key] === "string",
      )
    )
      return false;
  }
  if (
    isRecord(value) &&
    value.issuerScope !== undefined &&
    (typeof value.issuerScope !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(value.issuerScope))
  )
    return false;
  return (
    isRecord(value) &&
    value.version === 1 &&
    (value.kind === "devis" || value.kind === "facture") &&
    strings(value, [
      "companyKey",
      "reference",
      "date",
      "acompte",
      "paymentDate",
      "paymentMethod",
      "customInvoiceNumber",
      "customInvoiceDate",
      "notes",
      "prompt",
    ]) &&
    typeof value.showAcompte === "boolean" &&
    typeof value.isPaid === "boolean" &&
    isClient(value.client) &&
    Array.isArray(value.lines) &&
    value.lines.every(isLine) &&
    Array.isArray(value.payments) &&
    value.payments.every(isPaymentNote)
  );
}
export function isProposalShape(value: unknown): value is AgentProposal {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.kind !== "devis" && value.kind !== "facture")
  )
    return false;
  for (const field of ["companyKey", "reference", "date", "notes", "acompte"]) {
    if (value[field] !== undefined && typeof value[field] !== "string")
      return false;
  }
  if (value.showAcompte !== undefined && typeof value.showAcompte !== "boolean")
    return false;
  if (
    value.lineMode !== undefined &&
    value.lineMode !== "append" &&
    value.lineMode !== "replace"
  )
    return false;
  if (value.client !== undefined) {
    if (!isRecord(value.client)) return false;
    const client = value.client;
    if (
      clientKeys.some(
        (key) => client[key] !== undefined && typeof client[key] !== "string",
      )
    )
      return false;
  }
  return (
    value.lines === undefined ||
    (Array.isArray(value.lines) &&
      value.lines.every(
        (line) =>
          isRecord(line) &&
          typeof line.name === "string" &&
          ((line.type === "normal" && strings(line, lineKeys)) ||
            (line.type === "title" &&
              lineKeys.every(
                (key) =>
                  line[key] === undefined || typeof line[key] === "string",
              ))),
      ))
  );
}
