/** Legacy editor contracts. Database monetary values remain Decimal/MinorUnits in billing.ts. */
export type DocumentKind = "devis" | "facture";
export interface ClientFields {
  name: string;
  street: string;
  cityZip: string;
  phone: string;
  email: string;
  workAddress: string;
}
export interface Company {
  databaseId?: string;
  id: number;
  name: string;
  address: string;
  cityZip: string;
  phone: string;
  email: string;
  siret: string;
  logo: string;
  color: string;
  vatRegime?: string;
}
export interface CatalogueService {
  name: string;
  unit: string;
  price: number;
  category: string;
}
export interface Line {
  key: string;
  type: "normal" | "title";
  name: string;
  quantity: string;
  unit: string;
  price: string;
  tva: string;
}
export type PdfLine =
  | { type: "title"; name: string }
  | {
      type: "normal";
      name: string;
      quantity: number;
      unit: string;
      price: number;
      tva: number;
    };
export interface PdfPayload {
  client: ClientFields;
  prestations: PdfLine[];
  selectedCompany: Company;
  invoiceNumber: string;
  formattedDate: string;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  showAcompte: boolean;
  acompte: number;
  resteAPayer: number;
  isPaid: boolean;
  paymentDate: string;
  paymentMethod: string;
  customInvoiceNumber: string;
  customInvoiceDate: string;
}

export type PaymentNote = {
  key: string;
  amount: string;
  date: string;
  method: string;
};
export type EditorDraft = {
  issuerScope?: string;
  fiscal?: {
    operationDate: string;
    dueDate: string;
    purchaseOrder: string;
    operationCategory: string;
  };
  version: 1;
  kind: DocumentKind;
  companyKey: string;
  client: ClientFields;
  lines: Line[];
  reference: string;
  date: string;
  showAcompte: boolean;
  acompte: string;
  isPaid: boolean;
  paymentDate: string;
  paymentMethod: string;
  customInvoiceNumber: string;
  customInvoiceDate: string;
  notes: string;
  prompt: string;
  payments: PaymentNote[];
};
export type ProposedLine =
  // Empty unit/quantity/price/tva means unknown in a draft, never a fiscal zero.
  | (Omit<Line, "key" | "type"> & { type: "normal" })
  | {
      type: "title";
      name: string;
      quantity?: string;
      unit?: string;
      price?: string;
      tva?: string;
    };
export type AgentProposal = {
  priceSources?: { lineIndex?: number; lineKey?: string; text: string }[];
  version: 1;
  kind: DocumentKind;
  client?: Partial<ClientFields>;
  companyKey?: string;
  lines?: ProposedLine[];
  lineMode?: "append" | "replace";
  lineUpdates?: ({ key: string } & Partial<
    Pick<Line, "name" | "unit" | "quantity" | "price" | "tva">
  >)[];
  reference?: string;
  date?: string;
  notes?: string;
  acompte?: string;
  showAcompte?: boolean;
};
