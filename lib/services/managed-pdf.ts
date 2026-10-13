import { generateManagedQuote } from "../../utils/managedQuote";
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isRecord } from "../editor/contracts";
import { scopedRecord } from "./workspace";
import { databaseForAdmin } from "../supabase/server";
import { checkedRpc, persistenceError } from "./billing";
import { archivePdf, verifiedPdf } from "./archive";
import {
  generateManagedInvoice,
  type ManagedPayload,
} from "../../utils/managedInvoice";
import { value, type Row } from "../workspace/client";

const decimal = (raw: unknown) => {
  if (typeof raw !== "number" && typeof raw !== "string")
    throw new Error("PERSISTENCE_AMOUNT_INVALID");
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("PERSISTENCE_AMOUNT_INVALID");
  return n;
};
export async function managedInvoiceBytes(
  invoiceId: string,
  issuerId: string,
  paid = false,
  kind: "quote" | "invoice" = "invoice",
): Promise<Uint8Array> {
  const invoice = await scopedRecord(
    kind === "quote" ? "quotes" : "invoices",
    invoiceId,
    issuerId,
  );
  if (invoice.lifecycle !== "issued" && invoice.lifecycle !== "draft")
    throw new Error("LOGIFA_ISSUED_INVOICE_REQUIRED");
  const db = await databaseForAdmin(),
    balance =
      kind === "invoice"
        ? await checkedRpc(db, "logifa_invoice_balance", {
            p_invoice: invoiceId,
          })
        : {
            gross_minor: decimal(invoice.total_gross) * 100,
            remaining_minor: decimal(invoice.total_gross) * 100,
            due_minor: decimal(invoice.total_gross) * 100,
          };
  if (paid && balance.is_acquittable !== true)
    throw new Error("LOGIFA_NOT_FULLY_PAID");
  const snapshot = invoice.issuer_snapshot;
  if (!isRecord(snapshot)) throw new Error("LOGIFA_SNAPSHOT_REQUIRED");
  let profile: Row, entity: Row;
  if (invoice.lifecycle === "draft") {
    profile = snapshot;
    const response = await db
      .from("legal_entities")
      .select("*")
      .eq("id", invoice.legal_entity_id)
      .single();
    const raw: unknown = response.data;
    if (response.error || !isRecord(raw))
      throw new Error("LOGIFA_SNAPSHOT_REQUIRED");
    entity = raw;
  } else {
    if (!isRecord(snapshot.profile) || !isRecord(snapshot.legal_entity))
      throw new Error("LOGIFA_SNAPSHOT_REQUIRED");
    profile = snapshot.profile;
    entity = snapshot.legal_entity;
  }
  const client = invoice.client_snapshot;
  if (!isRecord(client)) throw new Error("LOGIFA_SNAPSHOT_REQUIRED");
  const mentions = entity.legal_mentions;
  if (
    !isRecord(mentions) ||
    typeof mentions.payment_terms !== "string" ||
    typeof mentions.pdf_footer !== "string" ||
    !mentions.pdf_footer.trim()
  )
    throw new Error("LOGIFA_PDF_MENTIONS_REQUIRED");
  const logo = value(profile, "logo_path");
  let logoBytes: Uint8Array;
  if (/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(logo))
    logoBytes = Buffer.from(logo.split(",")[1], "base64");
  else if (/^\/[a-zA-Z0-9_-]+\.png$/.test(logo))
    logoBytes = await readFile(
      path.join(process.cwd(), "public", logo.slice(1)),
    );
  else throw new Error("LOGIFA_PNG_LOGO_REQUIRED");
  const items = await db
    .from(kind === "quote" ? "quote_items" : "invoice_items")
    .select("*")
    .eq(kind === "quote" ? "quote_id" : "invoice_id", invoiceId)
    .order("position");
  if (items.error) throw persistenceError(items.error);
  const rows: unknown = items.data;
  if (!Array.isArray(rows) || !rows.every(isRecord))
    throw new Error("PERSISTENCE_RESPONSE_INVALID");
  const fields = isRecord(client.editor_fields) ? client.editor_fields : {};
  const date = value(invoice, "issue_date")
    .slice(0, 10)
    .split("-")
    .reverse()
    .join("-");
  let paymentDate = "",
    paymentMethod = "";
  if (paid) {
    const deductions = await db
      .from("deposit_deductions")
      .select("deposit_invoice_id")
      .eq("final_invoice_id", invoiceId);
    if (deductions.error) throw persistenceError(deductions.error);
    const d: unknown = deductions.data;
    if (!Array.isArray(d) || !d.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    const ids = [invoiceId, ...d.map((row) => String(row.deposit_invoice_id))];
    const allocated = await db
      .from("payment_allocations")
      .select("*")
      .in("invoice_id", ids);
    if (allocated.error) throw persistenceError(allocated.error);
    const a: unknown = allocated.data;
    if (!Array.isArray(a) || !a.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    const reversed = await db
      .from("allocation_reversals")
      .select("*")
      .in(
        "allocation_id",
        a.map((row) => String(row.id)),
      );
    if (reversed.error) throw persistenceError(reversed.error);
    const r: unknown = reversed.data;
    if (!Array.isArray(r) || !r.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    const remaining = a.filter(
      (allocation) =>
        BigInt(String(allocation.amount_minor)) >
        r
          .filter((row) => row.allocation_id === allocation.id)
          .reduce((sum, row) => sum + BigInt(String(row.amount_minor)), 0n),
    );
    const payments = await db
      .from("payments")
      .select("*")
      .in(
        "id",
        remaining.map((row) => String(row.payment_id)),
      );
    if (payments.error) throw persistenceError(payments.error);
    const p: unknown = payments.data;
    if (!Array.isArray(p) || !p.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    paymentDate =
      p
        .map((row) => value(row, "received_on"))
        .sort()
        .at(-1) ?? "";
    paymentMethod = [...new Set(p.map((row) => value(row, "method")))].join(
      ", ",
    );
  }
  const payload: ManagedPayload = {
    client: {
      name: value(fields, "name") || value(client, "company_name"),
      street: value(fields, "street") || value(client, "billing_address"),
      cityZip: value(fields, "cityZip"),
      phone:
        typeof fields.phone === "string"
          ? fields.phone
          : value(client, "phone"),
      email:
        typeof fields.email === "string"
          ? fields.email
          : value(client, "contact_email"),
      workAddress:
        value(fields, "workAddress") || value(client, "work_address"),
    },
    selectedCompany: {
      id: 0,
      name: value(profile, "commercial_name"),
      address: value(profile, "address"),
      cityZip: value(profile, "city_zip"),
      phone: value(profile, "phone"),
      email: value(profile, "email"),
      siret: value(entity, "siret"),
      logo,
      color: value(profile, "color") || "#173d32",
    },
    prestations: rows.map((row) =>
      row.item_type === "title"
        ? {
            type: "title",
            name: value(row, "description") || value(row, "title"),
          }
        : {
            type: "normal",
            name: value(row, "description"),
            quantity: decimal(row.quantity),
            unit: value(row, "unit"),
            price: decimal(row.unit_price),
            tva: decimal(row.vat_rate),
            totalNet: decimal(row.total_net),
          },
    ),
    invoiceNumber:
      invoice.lifecycle === "draft"
        ? "BROUILLON"
        : value(invoice, kind === "quote" ? "quote_number" : "invoice_number"),
    formattedDate: date,
    totalHT: decimal(invoice.total_net),
    totalTVA: decimal(invoice.total_vat),
    totalTTC: decimal(invoice.total_gross),
    showAcompte: false,
    acompte: 0,
    resteAPayer: decimal(balance.remaining_minor) / 100,
    isPaid: paid,
    paymentDate,
    paymentMethod,
    customInvoiceNumber: "",
    customInvoiceDate: "",
    logoBytes,
    documentTitle:
      invoice.document_kind === "deposit"
        ? "FACTURE D'ACOMPTE"
        : invoice.document_kind === "final"
          ? "FACTURE DE SOLDE"
          : invoice.document_kind === "credit"
            ? "AVOIR"
            : "FACTURE",
    manager: value(mentions, "manager"),
    insuranceLabel: value(mentions, "insurance_label"),
    paymentTerms: mentions.payment_terms,
    legalFooter: [
      mentions.pdf_footer,
      `Entité juridique : ${value(entity, "legal_name")} · ${value(entity, "legal_status")} · SIRET ${value(entity, "siret")}`,
      `Client : ${value(client, "company_name")} · SIRET ${value(client, "siret")} · TVA ${value(client, "vat_number")}`,
      ...(kind === "invoice"
        ? [
            `Date de l'opération : ${value(invoice, "operation_date")} · Échéance : ${value(invoice, "due_date")}`,
            `Nature : ${value(invoice, "operation_category")} · Bon de commande : ${value(invoice, "purchase_order")}`,
          ]
        : []),
      `TVA : ${value(entity, "vat_regime")} · ${value(entity, "vat_number")}`,
      `IBAN : ${value(entity, "iban")} · BIC : ${value(entity, "bic")}`,
    ],
    deductions:
      invoice.document_kind === "final"
        ? [
            {
              label: "Acomptes facturés déduits",
              amount: decimal(balance.deductions_minor) / 100,
            },
            {
              label: "Avoirs imputés",
              amount: decimal(balance.credits_minor) / 100,
            },
            {
              label: "Encaissements affectés",
              amount: decimal(balance.paid_minor) / 100,
            },
            {
              label: "Reste à encaisser sur la chaîne",
              amount: decimal(balance.chain_remaining_minor) / 100,
            },
          ]
        : [],
    netDue: decimal(balance.due_minor) / 100,
  };
  if (invoice.document_kind === "final") {
    const tax = await checkedRpc(db, "logifa_invoice_tax_breakdown", {
        p_invoice: invoiceId,
      }),
      raw = tax.tax_breakdown;
    if (!Array.isArray(raw) || !raw.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    payload.totalHT =
      raw.reduce((sum, row) => sum + decimal(row.net_minor), 0) / 100;
    payload.totalTVA =
      raw.reduce((sum, row) => sum + decimal(row.vat_minor), 0) / 100;
    payload.totalTTC = payload.totalHT + payload.totalTVA;
    payload.deductions.unshift({
      label: "Montant total du chantier TTC",
      amount: decimal(invoice.total_gross),
    });
  }
  return kind === "quote"
    ? generateManagedQuote(payload)
    : generateManagedInvoice(payload);
}
export async function archiveManagedInvoice(
  invoiceId: string,
  issuerId: string,
  paid: boolean,
  kind: "quote" | "invoice" = "invoice",
) {
  if (paid && kind === "quote") throw new Error("LOGIFA_PAID_INVOICE_REQUIRED");
  const record = await scopedRecord(
    kind === "quote" ? "quotes" : "invoices",
    invoiceId,
    issuerId,
  );
  if (record.lifecycle !== "issued")
    throw new Error("LOGIFA_ISSUED_DOCUMENT_REQUIRED");
  const db = await databaseForAdmin();
  const original = await db
    .from("document_files")
    .select("id")
    .eq(kind === "quote" ? "quote_id" : "invoice_id", invoiceId)
    .eq("role", "original")
    .maybeSingle();
  if (original.error) throw persistenceError(original.error);
  if (!original.data) {
    const bytes = await managedInvoiceBytes(invoiceId, issuerId, false, kind);
    await archivePdf({
      kind,
      documentId: invoiceId,
      fileId: randomUUID(),
      role: "original",
      originalFilename: "facture-originale.pdf",
      bytes,
    });
  }
  if (paid) {
    const bytes = await managedInvoiceBytes(invoiceId, issuerId, true);
    return archivePdf({
      kind: "invoice",
      documentId: invoiceId,
      fileId: randomUUID(),
      role: "paid_version",
      originalFilename: "facture-acquittee.pdf",
      bytes,
    });
  }
  if (original.data) return { id: original.data.id };
  return { archived: true };
}
