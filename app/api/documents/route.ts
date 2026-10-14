import { requireAdmin } from "@/lib/auth/require-admin";
import {
  errorResponse,
  mutationOrigin,
  privateJson,
} from "@/lib/workspace/http";
import { archivePdf } from "@/lib/services/archive";
import { scopedRecord } from "@/lib/services/workspace";
import { billingService } from "@/lib/services/billing";
import { uuid, isoDate } from "@/lib/billing/validation";
import { randomUUID } from "node:crypto";
import { databaseForAdmin } from "@/lib/supabase/server";
export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 27000000)
      throw new Error("INPUT_SIZE");
    const data = await request.formData();
    const string = (key: string) => {
      const v = data.get(key);
      if (typeof v !== "string") throw new Error("INPUT_FIELD");
      return v;
    };
    if (string("confirmed") !== "true")
      throw new Error("HUMAN_CONFIRMATION_REQUIRED");
    const issuer = uuid(string("issuer_id")),
      client = uuid(string("client_id"));
    await scopedRecord("clients", client, issuer);
    const file = data.get("file");
    if (!(file instanceof File) || file.size > 26214400)
      throw new Error("PDF_REQUIRED");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-")
      throw new Error("PDF_REQUIRED");
    const kind = string("kind");
    if (kind !== "quote" && kind !== "invoice") throw new Error("INPUT_KIND");
    const role = data.has("role") ? string("role") : "original";
    if (role !== "original" && role !== "signed" && role !== "proof")
      throw new Error("INPUT_FILE_ROLE");
    if (role === "signed" && kind !== "quote")
      throw new Error("INPUT_SIGNED_QUOTE");
    const signedAt =
      role === "signed"
        ? isoDate(string("signed_date")) + "T00:00:00.000Z"
        : null;
    const existing =
      data.has("existing_id") && string("existing_id")
        ? uuid(string("existing_id"))
        : null;
    // Accept French formatting on input, then keep canonical decimal strings
    // for the existing exact-decimal billing validation.
    const amount = (key: string): string => {
      const label: Record<string, string> = { total_net: "HT", total_vat: "TVA", total_gross: "TTC" };
      let raw = string(key).trim().replace(/\s/g, "").replace(/€/g, "").replace(/EUR/gi, "");
      // Accept French and international thousands separators, but reject ambiguous inputs.
      if (raw.includes(",") && raw.includes(".")) {
        raw = raw.lastIndexOf(",") > raw.lastIndexOf(".")
          ? raw.replace(/\./g, "").replace(",", ".")
          : raw.replace(/,/g, "");
      } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) {
        raw = raw.replace(/\./g, "").replace(",", ".");
      } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw)) {
        raw = raw.replace(/,/g, "");
      } else {
        raw = raw.replace(",", ".");
      }
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw))
        throw new Error("Montant " + (label[key] ?? key) + " invalide : saisissez par exemple 1250,50.");
      return raw;
    };
    const totalNet = amount("total_net");
    const totalVat = amount("total_vat");
    const totalGross = amount("total_gross");
    let document: Record<string, unknown>;
    if (existing) {
      document = await scopedRecord(
        kind === "quote" ? "quotes" : "invoices",
        existing,
        issuer,
      );
      if (document.client_id !== client)
        throw new Error("LOGIFA_CLIENT_ISSUER_MISMATCH");
    } else {
      const db = await databaseForAdmin();
      const table = kind === "quote" ? "quotes" : "invoices";
      const numberColumn = kind === "quote" ? "quote_number" : "invoice_number";
      const number = string("number").trim();
      // The unique key lives at legal-entity level (not at issuer-profile
      // level). Search only likely matching numbers instead of scanning the
      // first 500 documents; historical imports may contain leading spaces.
      const issuerRow = await db.from("issuer_profiles")
        .select("legal_entity_id").eq("id", issuer).single();
      if (issuerRow.error || !issuerRow.data?.legal_entity_id)
        throw new Error("Entité juridique de l'émetteur introuvable.");
      if (!number || number.length > 200)
        throw new Error("Numéro historique invalide.");
      const escaped = [...number].map((character) =>
        ["%", "_", "\\"].includes(character) ? "\\" + character : character
      ).join("");
      const duplicates = await db.from(table).select("*")
        .eq("legal_entity_id", issuerRow.data.legal_entity_id)
        .ilike(numberColumn, "%" + escaped)
        .limit(500);
      if (duplicates.error)
        throw new Error("Recherche du document historique impossible.");
      const matches = (duplicates.data ?? []).filter((item) =>
        typeof item[numberColumn] === "string" && item[numberColumn].trim() === number);
      if (matches.some((item) => item.issuer_profile_id !== issuer))
        throw new Error("Ce numéro est déjà utilisé par un autre profil de la même entité juridique.");
      if (matches.length > 1) throw new Error("Plusieurs documents historiques portent ce numéro. Vérification manuelle nécessaire.");
      if (matches.length === 1) {
        const row = matches[0];
        const money = (v: unknown) => Number(v).toFixed(2);
        if (row.origin !== "historical" || row.client_id !== client ||
          String(row.issue_date).slice(0, 10) !== string("date") ||
          money(row.total_net) !== money(totalNet) ||
          money(row.total_vat) !== money(totalVat) ||
          money(row.total_gross) !== money(totalGross)) {
          throw new Error("Ce numéro existe déjà pour cette entreprise avec des informations différentes. Vérifiez le devis importé.");
        }
        const archived = await db.from("document_files").select("id")
          .eq(kind === "quote" ? "quote_id" : "invoice_id", row.id)
          .eq("role", "original").maybeSingle();
        if (archived.error) throw new Error("Vérification du PDF original impossible.");
        if (archived.data) throw new Error("Ce document et son PDF original sont déjà importés.");
        document = row;
      } else {
        document = await billingService.importHistorical(kind, {
          issuer_profile_id: issuer,
          client_id: client,
          number,
          issue_date: string("date"),
          original_status: string("status"),
          import_key: data.has("import_key")
            ? uuid(string("import_key"))
            : randomUUID(),
          total_net: totalNet,
          total_vat: totalVat,
          total_gross: totalGross,
        });
      }
    }
    if (typeof document.id !== "string")
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    // Stable object path for retries of the same historical import.
    const archived = await archivePdf({
      kind,
      documentId: document.id,
      fileId: role === "original" ? uuid(String(document.id)) : randomUUID(),
      role,
      originalFilename: file.name,
      bytes,
    });
    if (role === "signed") {
      if (typeof archived.id !== "string")
        throw new Error("PERSISTENCE_RESPONSE_INVALID");
      await billingService.recordSignature({
        quote_id: document.id,
        provider: "manual-import",
        external_reference: null,
        status: "signed",
        sent_at: null,
        signed_at: signedAt,
        signer_identity: null,
        signed_file_id: archived.id,
        evidence_file_ids: [],
      });
    }
    return privateJson({ document, archived });
  } catch (e) {
    return errorResponse(e);
  }
}
