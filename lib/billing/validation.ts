import type { Line } from '../../types/editor.ts';
import type { DraftInput, EditorLine, HistoricalInput, PaymentInput } from '../../types/billing.ts';
import { halfUp, MAX_MINOR, moneyMinor, positiveMinor, scaled } from './money.ts';

export function uuid(value: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new Error('UUID_REQUIRED');
  return value;
}
export function isoDate(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value) throw new Error('DATE_REQUIRED');
  return value;
}
export function text(value: string, maximum = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) throw new Error('TEXT_REQUIRED');
  return value;
}
export function exactLineTotals(quantityText: string, price: string, rateText: string) {
  const quantity = scaled(quantityText), rate = scaled(rateText);
  if (quantity <= 0n || quantity > 9999999999n || rate > 10000n) throw new Error('LINE_INVALID');
  const net = halfUp(quantity * moneyMinor(price), 100n);
  const vat = halfUp(net * rate, 10000n);
  if (net + vat > MAX_MINOR) throw new Error('AMOUNT_LIMIT');
  return { net, vat, gross: net + vat };
}
export function lineTotals(lines: readonly (EditorLine | Line)[]) {
  if (!Array.isArray(lines) || lines.length > 1000) throw new Error('LINES_REQUIRED');
  let net = 0n, vat = 0n;
  const breakdown = new Map<string, { net: bigint; vat: bigint }>();
  for (const line of lines) {
    text(line.name);
    if (line.type === 'title') continue;
    if (line.type !== 'normal' || !['m²','ml','unité','forfait','m³'].includes(line.unit)) throw new Error('LINE_INVALID');
    const rate = scaled(line.tva);
    const { net: lineNet, vat: lineVat } = exactLineTotals(line.quantity, line.price, line.tva);
    net += lineNet; vat += lineVat;
    const key = rate.toString(), existing = breakdown.get(key) ?? { net: 0n, vat: 0n };
    breakdown.set(key, { net: existing.net + lineNet, vat: existing.vat + lineVat });
  }
  if (net + vat > MAX_MINOR) throw new Error('AMOUNT_LIMIT');
  return { net, vat, gross: net + vat, breakdown };
}
export function validateDraft(input: DraftInput): DraftInput {
  uuid(input.issuer_profile_id); uuid(input.client_id);
  for (const id of [input.project_id,input.quote_id,input.correction_of]) if (id !== undefined) uuid(id);
  if (input.document_kind && !['classic','deposit','final','credit'].includes(input.document_kind)) throw new Error('INVOICE_KIND');
  lineTotals(input.lines); return input;
}
export function validatePayment(input: PaymentInput): PaymentInput {
  uuid(input.issuer_profile_id); uuid(input.client_id); uuid(input.idempotency_key);
  for (const id of [input.quote_id,input.project_id]) if (id !== undefined) uuid(id);
  positiveMinor(input.amount_minor); isoDate(input.received_on); text(input.method,100);
  if (!['deposit','earnest','unqualified'].includes(input.qualification)) throw new Error('QUALIFICATION_REQUIRED');
  if (input.bank_reference !== undefined) text(input.bank_reference,500);
  if (input.notes !== undefined) text(input.notes);
  return input;
}
export function validateHistory(input: HistoricalInput): HistoricalInput {
  uuid(input.issuer_profile_id); uuid(input.import_key); text(input.number,200); text(input.original_status,200); isoDate(input.issue_date);
  if (moneyMinor(input.total_net) + moneyMinor(input.total_vat) !== moneyMinor(input.total_gross)) throw new Error('HISTORY_TOTALS');
  for (const id of [input.client_id,input.project_id,input.quote_id,input.correction_of]) if (id !== undefined) uuid(id);
  return input;
}
export function settlement(due: bigint, paid: bigint) {
  if (due < 0n || paid < 0n) throw new Error('NEGATIVE_BALANCE');
  return { status: paid >= due ? 'paid' : paid === 0n ? 'unpaid' : 'partially_paid', remaining: due > paid ? due - paid : 0n, overpaid: paid > due ? paid - due : 0n };
}
