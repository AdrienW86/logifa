import { isRecord } from "../editor/contracts.ts";
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftInput, HistoricalInput, PaymentInput, SignatureTracking } from '../../types/billing.ts';
import { requireAdmin } from '../auth/require-admin.ts';
import { databaseForAdmin } from '../supabase/server.ts';
import { isoDate, text, uuid, validateDraft, validateHistory, validatePayment } from '../billing/validation.ts';
import { positiveMinor } from '../billing/money.ts';

export function persistenceError(error: { code?: string; message?: string }): Error {
  const code = error.message?.match(/\bLOGIFA_[A-Z_]+\b/)?.[0] ?? `PERSISTENCE_ERROR_${error.code ?? 'UNKNOWN'}`;
  if (code === 'LOGIFA_DEDUCTED_DEPOSIT_CREDIT_REQUIRES_REVIEW') {
    return new Error(`${code} : Régularisation comptable et fiscale coordonnée nécessaire pour cet acompte après émission de la finale. Un avoir sur la finale ne remplace pas automatiquement cette régularisation.`);
  }
  return new Error(code);
}
export async function checkedRpc(client: SupabaseClient, name: string, params: Record<string, unknown> = {}) {
  await requireAdmin();
  const response = await client.rpc(name, params);
  const data: unknown = response.data;
  const error = response.error;
  if (error) throw persistenceError(error);
  if (!isRecord(data)) throw new Error('PERSISTENCE_RESPONSE_INVALID');
  return data;
}
export class BillingService {
  private database: () => Promise<SupabaseClient>;
  constructor(database: () => Promise<SupabaseClient> = databaseForAdmin) { this.database = database; }
  private async db() { await requireAdmin(); return this.database(); }
  async saveDraft(kind: 'quote' | 'invoice', input: DraftInput, id: string | null = null) {
    const db = await this.db(); validateDraft(input); if (id) uuid(id);
    const data = kind === 'invoice' ? { ...input, document_kind: input.document_kind ?? 'classic' } : input;
    return checkedRpc(db, 'logifa_save_document', { p_kind: kind, p_id: id, p_data: data });
  }
  async issue(kind: 'quote' | 'invoice', id: string, issueDate: string) {
    const db = await this.db(); uuid(id); isoDate(issueDate);
    return checkedRpc(db, 'logifa_issue_document', { p_kind: kind, p_id: id, p_date: issueDate });
  }
  async recordPayment(input: PaymentInput) {
    const db = await this.db(); validatePayment(input);
    return checkedRpc(db, 'logifa_record_payment', { p_data: input });
  }
  async acceptQuote(quoteId: string) {
    const db = await this.db(); uuid(quoteId);
    return checkedRpc(db,'logifa_accept_quote',{ p_quote: quoteId });
  }
  async reviewPayment(paymentId: string, reconciliation: 'pending' | 'reviewed', tax: 'pending' | 'reviewed') {
    const db = await this.db(); uuid(paymentId);
    if (![reconciliation,tax].every(v => ['pending','reviewed'].includes(v))) throw new Error('PAYMENT_REVIEW_STATUS');
    return checkedRpc(db,'logifa_review_payment',{ p_payment: paymentId, p_reconciliation: reconciliation, p_tax: tax });
  }
  async qualifyPayment(paymentId: string, qualification: 'deposit' | 'earnest' | 'unqualified', reason: string) {
    const db = await this.db(); uuid(paymentId); text(reason);
    if (!['deposit','earnest','unqualified'].includes(qualification)) throw new Error('QUALIFICATION_REQUIRED');
    return checkedRpc(db,'logifa_qualify_payment',{ p_payment: paymentId, p_qualification: qualification, p_reason: reason });
  }
  async allocate(paymentId: string, invoiceId: string, amountMinor: string, key: string) {
    const db = await this.db(); uuid(paymentId); uuid(invoiceId); uuid(key); positiveMinor(amountMinor);
    return checkedRpc(db, 'logifa_allocate_payment', { p_payment: paymentId, p_invoice: invoiceId, p_amount: amountMinor, p_key: key });
  }
  async linkDeposit(finalId: string, depositId: string) {
    const db = await this.db(); uuid(finalId); uuid(depositId);
    return checkedRpc(db, 'logifa_link_deposit', { p_final: finalId, p_deposit: depositId });
  }
  async validateHistoricalCredit(creditId: string, invoiceId: string, reason: string) {
    const db = await this.db(); uuid(creditId); uuid(invoiceId); text(reason);
    return checkedRpc(db,'logifa_validate_historical_credit',{ p_credit: creditId, p_invoice: invoiceId, p_reason: reason });
  }
  async applyCredit(creditId: string, invoiceId: string, amountMinor: string, key: string) {
    const db = await this.db(); uuid(creditId); uuid(invoiceId); uuid(key); positiveMinor(amountMinor);
    return checkedRpc(db, 'logifa_apply_credit', { p_credit: creditId, p_invoice: invoiceId, p_amount: amountMinor, p_key: key });
  }
  async refund(paymentId: string, amountMinor: string, receivedOn: string, method: string, key: string, allocationId: string | null = null) {
    const db = await this.db(); uuid(paymentId); positiveMinor(amountMinor); isoDate(receivedOn); text(method,100); uuid(key); if (allocationId) uuid(allocationId);
    return checkedRpc(db, 'logifa_refund_payment', { p_payment: paymentId, p_amount: amountMinor, p_date: receivedOn, p_method: method, p_key: key, p_allocation: allocationId });
  }
  async balance(invoiceId: string) {
    const db = await this.db(); uuid(invoiceId);
    return checkedRpc(db, 'logifa_invoice_balance', { p_invoice: invoiceId });
  }
  async taxBreakdown(invoiceId: string) {
    const db = await this.db(); uuid(invoiceId);
    return checkedRpc(db,'logifa_invoice_tax_breakdown',{ p_invoice: invoiceId });
  }
  async paymentStatus(paymentId: string) {
    const db = await this.db(); uuid(paymentId);
    return checkedRpc(db, 'logifa_payment_status', { p_payment: paymentId });
  }
  async importHistorical(kind: 'quote' | 'invoice', input: HistoricalInput) {
    const db = await this.db(); validateHistory(input);
    return checkedRpc(db, 'logifa_import_document', { p_kind: kind, p_data: input });
  }
  async recordSignature(input: Omit<SignatureTracking, 'id' | 'created_at'>) {
    const db = await this.db(); uuid(input.quote_id);
    if (!['prepared','sent','signed','declined','expired'].includes(input.status)) throw new Error('SIGNATURE_STATUS');
    if (input.signed_file_id) uuid(input.signed_file_id);
    for (const id of input.evidence_file_ids) uuid(id);
    return checkedRpc(db, 'logifa_record_signature', { p_data: input });
  }
}
export const billingService = new BillingService();
