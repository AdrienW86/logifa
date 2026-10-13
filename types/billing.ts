export type UUID = string;
export type Decimal = string;
export type MinorUnits = bigint;
export type VatRegime = 'unknown' | 'standard' | 'exempt' | 'reverse_charge';
export type InvoiceKind = 'classic' | 'deposit' | 'final' | 'credit';
export type Lifecycle = 'draft' | 'issued' | 'historical';
export type Qualification = 'deposit' | 'earnest' | 'unqualified';
export type FileRole = 'original' | 'paid_version' | 'signed' | 'proof';
export type SettlementStatus = 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'credited';

export interface LegalEntity {
  id: UUID; legal_name: string | null; siren: string | null; siret: string | null;
  legal_status: string | null; address: Record<string, unknown>; contacts: Record<string, unknown>;
  vat_regime: VatRegime; vat_exigibility: 'unknown' | 'cash' | 'debits' | 'delivery'; default_vat_rate: Decimal | null; vat_number: string | null;
  iban: string | null; bic: string | null; bank_name: string | null;
  insurance: unknown[]; legal_mentions: Record<string, unknown>; reviewed: boolean;
}
export interface IssuerProfile {
  id: UUID; legal_entity_id: UUID | null; commercial_name: string;
  source_key: string | null; source_fingerprint: string | null; source_local_id: number | null;
  source_siret: string | null; address: string | null; city_zip: string | null;
  phone: string | null; email: string | null; logo_path: string | null; color: string | null;
  pdf_template: 'local-v1' | string; metadata: Record<string, unknown>;
}
export interface Client {
  id: UUID; user_id: string; company_name: string; commercial_name: string | null;
  contact_email: string | null; phone: string | null; siret: string | null; vat_number: string | null;
  street_number: string | null; street_name: string | null; postal_code: string | null;
  city: string | null; address_complement: string | null; payment_terms: string;
}
export interface Project {
  id: UUID; user_id: string; client_id: UUID; issuer_profile_id: UUID | null;
  name: string; project_code: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  estimated_budget: Decimal; start_date: string | null; end_date: string | null;
}
export type EditorLine = { type: 'title'; name: string } | {
  type: 'normal'; name: string; quantity: Decimal; unit: 'm²' | 'ml' | 'unité' | 'forfait' | 'm³'; price: Decimal; tva: Decimal;
};
export interface DraftInput {
  issuer_profile_id: UUID; client_id: UUID; project_id?: UUID; quote_id?: UUID;
  document_kind?: InvoiceKind; correction_of?: UUID; credit_reason?: string; lines: EditorLine[];
}
export interface BaseDocument {
  id: UUID; user_id: string; client_id: UUID | null; project_id: UUID | null;
  issuer_profile_id: UUID | null; legal_entity_id: UUID | null; logifa_managed: boolean;
  origin: 'native' | 'historical'; lifecycle: Lifecycle | null; issue_date: string;
  total_net: Decimal; total_vat: Decimal; total_gross: Decimal;
  issuer_snapshot: Record<string, unknown>; client_snapshot: Record<string, unknown>;
  original_status: string | null; historical_metadata: Record<string, unknown>; currency: 'EUR';
}
export interface Quote extends BaseDocument { quote_number: string | null; status: string; }
export interface Invoice extends BaseDocument {
  invoice_number: string | null; status: string; document_kind: InvoiceKind;
  quote_id: UUID | null; correction_of: UUID | null; credit_reason: string | null; deposit_amount: Decimal;
}
export interface DocumentLine {
  id: UUID; position: number | null; item_type: 'item' | 'title'; description: string | null;
  quantity: Decimal; unit: string | null; unit_price: Decimal; vat_rate: Decimal; total_net: Decimal;
}
export interface QuoteItem extends DocumentLine { quote_id: UUID; }
export interface InvoiceItem extends DocumentLine { invoice_id: UUID; title: string | null; }
export interface PaymentInput {
  issuer_profile_id: UUID; client_id: UUID; quote_id?: UUID; project_id?: UUID;
  amount_minor: string; received_on: string; method: string; qualification: Qualification;
  bank_reference?: string; notes?: string; idempotency_key: UUID;
}
export interface Payment extends Omit<PaymentInput, 'amount_minor'> {
  id: UUID; legal_entity_id: UUID; amount_minor: MinorUnits; direction: 'incoming' | 'refund';
  refund_of: UUID | null; reconciliation_status: 'pending' | 'reviewed'; tax_review_status: 'pending' | 'reviewed';
}
export interface Allocation { id: UUID; payment_id: UUID; invoice_id: UUID; amount_minor: MinorUnits; idempotency_key: UUID; }
export interface AllocationReversal { id: UUID; allocation_id: UUID; refund_payment_id: UUID; amount_minor: MinorUnits; }
export interface DepositDeduction { id: UUID; final_invoice_id: UUID; deposit_invoice_id: UUID; tax_snapshot: { vat_rate: Decimal; net_minor: MinorUnits; vat_minor: MinorUnits }[] | null; }
export interface HistoricalCreditValidation { id: UUID; credit_invoice_id: UUID; invoice_id: UUID; reason: string; actor_subject: string; created_at: string; }
export interface CreditApplication { id: UUID; credit_invoice_id: UUID; invoice_id: UUID; amount_minor: MinorUnits; idempotency_key: UUID; }
export interface DocumentSequence { id: UUID; legal_entity_id: UUID; document_type: 'invoice' | 'quote'; prefix: string; next_value: bigint; last_issue_date: string | null; }
export interface DocumentFile {
  id: UUID; quote_id: UUID | null; invoice_id: UUID | null; project_id: UUID | null; payment_id: UUID | null;
  role: FileRole; bucket_id: 'logifa-documents'; storage_path: string; sha256: string;
  byte_size: number; mime_type: 'application/pdf'; original_filename: string; metadata: Record<string, unknown>;
}
export interface SignatureTracking {
  id: UUID; quote_id: UUID; provider: string | null; external_reference: string | null;
  status: 'prepared' | 'sent' | 'signed' | 'declined' | 'expired'; sent_at: string | null; signed_at: string | null;
  signer_identity: Record<string, unknown> | null; signed_file_id: UUID | null; evidence_file_ids: UUID[];
}
export interface DocumentEvent { id: UUID; occurred_at: string; actor_subject: string; event_type: string; table_name: string; record_id: UUID; data: Record<string, unknown>; }
export interface HistoricalInput {
  issuer_profile_id: UUID; number: string; issue_date: string; original_status: string;
  import_key: UUID; total_net: Decimal; total_vat: Decimal; total_gross: Decimal;
  client_id?: UUID; project_id?: UUID; quote_id?: UUID; correction_of?: UUID; document_kind?: InvoiceKind;
  issuer_snapshot?: Record<string, unknown>; client_snapshot?: Record<string, unknown>;
}
