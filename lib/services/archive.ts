import "server-only";
import { createHash } from "node:crypto";
import type { FileRole } from "../../types/billing.ts";
import { databaseForAdmin } from "../supabase/server.ts";
import { requireAdmin } from "../auth/require-admin.ts";
import { checkedRpc, persistenceError } from "./billing.ts";
import { text, uuid } from "../billing/validation.ts";
import { isRecord } from "../editor/contracts.ts";

const BUCKET = "logifa-documents";
async function requirePaidVariant(
  db: Awaited<ReturnType<typeof databaseForAdmin>>,
  invoiceId: string,
) {
  uuid(invoiceId);
  const balance = await checkedRpc(db, "logifa_invoice_balance", {
    p_invoice: invoiceId,
  });
  if (balance.is_acquittable !== true) throw new Error("LOGIFA_NOT_FULLY_PAID");
}
export interface ArchiveInput {
  kind: "invoice" | "quote" | "project" | "payment";
  documentId: string;
  fileId: string;
  role: FileRole;
  originalFilename: string;
  bytes: Uint8Array;
  metadata?: Record<string, unknown>;
}
export async function archivePdf(input: ArchiveInput) {
  await requireAdmin();
  uuid(input.documentId);
  uuid(input.fileId);
  text(input.originalFilename, 250);
  if (
    /[\\/]/.test(input.originalFilename) ||
    !["invoice", "quote", "project", "payment"].includes(input.kind) ||
    !["original", "paid_version", "signed", "proof"].includes(input.role)
  )
    throw new Error("ARCHIVE_INPUT");
  if (
    input.bytes.byteLength < 5 ||
    input.bytes.byteLength > 26214400 ||
    Buffer.from(input.bytes.subarray(0, 5)).toString("ascii") !== "%PDF-"
  )
    throw new Error("PDF_REQUIRED");
  const db = await databaseForAdmin();
  if (input.role === "paid_version") {
    if (input.kind !== "invoice") throw new Error("ARCHIVE_INPUT");
    await requirePaidVariant(db, input.documentId);
  }
  const table = {
    invoice: "invoices",
    quote: "quotes",
    project: "projects",
    payment: "payments",
  }[input.kind];
  const result = await db
    .from(table)
    .select("*")
    .eq("id", input.documentId)
    .single();
  if (result.error) throw persistenceError(result.error);
  if (
    (input.kind === "invoice" || input.kind === "quote") &&
    !["issued", "historical"].includes(result.data.lifecycle)
  )
    throw new Error("ARCHIVE_EMITTED_DOCUMENT_REQUIRED");
  let entityId = result.data.legal_entity_id;
  if (input.kind === "project") {
    const issuer = await db
      .from("issuer_profiles")
      .select("legal_entity_id")
      .eq("id", result.data.issuer_profile_id)
      .single();
    if (issuer.error) throw persistenceError(issuer.error);
    entityId = issuer.data.legal_entity_id;
  }
  uuid(entityId);
  const storagePath = `${entityId}/${input.kind}/${input.documentId}/${input.fileId}.pdf`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const metadata = {
    [`${input.kind}_id`]: input.documentId,
    role: input.role,
    storage_path: storagePath,
    sha256,
    byte_size: input.bytes.byteLength,
    original_filename: input.originalFilename,
    metadata: {
      ...input.metadata,
      ...(input.role === "paid_version"
        ? { stamp: "ACQUITTÉ", variant_of: "original" }
        : {}),
    },
  };
  // A durable reservation precedes upload. Missing migration fails before writing Storage.
  await checkedRpc(db, "logifa_prepare_archive", { p_data: metadata });
  const uploaded = await db.storage
    .from(BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploaded.error) {
    // A retry may encounter the same immutable object. Never overwrite it.
    const existing = await db.storage.from(BUCKET).download(storagePath);
    if (
      existing.error ||
      !existing.data ||
      createHash("sha256")
        .update(Buffer.from(await existing.data.arrayBuffer()))
        .digest("hex") !== sha256
    )
      throw new Error("ARCHIVE_UPLOAD_FAILED");
  }
  return checkedRpc(db, "logifa_register_file", { p_data: metadata });
}
export async function verifiedPdf(fileId: string): Promise<Uint8Array> {
  await requireAdmin();
  uuid(fileId);
  const db = await databaseForAdmin();
  const row = await db
    .from("document_files")
    .select("*")
    .eq("id", fileId)
    .single();
  if (row.error) throw persistenceError(row.error);
  if (row.data.role === "paid_version")
    await requirePaidVariant(db, row.data.invoice_id);
  const file = await db.storage.from(BUCKET).download(row.data.storage_path);
  if (file.error) throw persistenceError(file.error);
  const bytes = Buffer.from(await file.data.arrayBuffer());
  if (
    bytes.byteLength !== Number(row.data.byte_size) ||
    createHash("sha256").update(bytes).digest("hex") !== row.data.sha256
  )
    throw new Error("ARCHIVE_INTEGRITY_FAILURE");
  return bytes;
}
// Explicit operator recovery only: never overwrite a blob or relax payment guards.
export async function recoverPendingArchives() {
  await requireAdmin();
  const db = await databaseForAdmin();
  const pending = await checkedRpc(db, "logifa_archive_pending");
  if (!Array.isArray(pending.items) || !pending.items.every(isRecord))
    throw new Error("PERSISTENCE_RESPONSE_INVALID");
  let recovered = 0,
    missing = 0,
    rejected = 0;
  for (const payload of pending.items) {
    if (typeof payload.storage_path !== "string") {
      rejected++;
      continue;
    }
    const file = await db.storage.from(BUCKET).download(payload.storage_path);
    if (file.error || !file.data) {
      missing++;
      continue;
    }
    const bytes = Buffer.from(await file.data.arrayBuffer());
    if (
      bytes.byteLength !== Number(payload.byte_size) ||
      createHash("sha256").update(bytes).digest("hex") !== payload.sha256
    ) {
      rejected++;
      continue;
    }
    try {
      await checkedRpc(db, "logifa_register_file", { p_data: payload });
      recovered++;
    } catch {
      rejected++;
    } // Includes ACQUITTÉ invalidated by a later refund.
  }
  return { recovered, missing, rejected };
}
export async function shortLivedPdfUrl(fileId: string): Promise<string> {
  await requireAdmin();
  uuid(fileId);
  const db = await databaseForAdmin();
  const row = await db
    .from("document_files")
    .select("storage_path,role,invoice_id")
    .eq("id", fileId)
    .single();
  if (row.error) throw persistenceError(row.error);
  if (row.data.role === "paid_version")
    await requirePaidVariant(db, row.data.invoice_id);
  const result = await db.storage
    .from(BUCKET)
    .createSignedUrl(row.data.storage_path, 60);
  if (result.error) throw persistenceError(result.error);
  return result.data.signedUrl;
}
