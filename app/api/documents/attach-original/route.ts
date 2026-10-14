import { requireAdmin } from "@/lib/auth/require-admin";
import { archivePdf } from "@/lib/services/archive";
import { scopedRecord } from "@/lib/services/workspace";
import { databaseForAdmin } from "@/lib/supabase/server";
import { uuid } from "@/lib/billing/validation";
import { errorResponse, mutationOrigin, privateJson } from "@/lib/workspace/http";

export const maxDuration = 60;

/**
 * Complete a historical quote import that created the immutable quote record
 * but failed to archive its original PDF. Never creates or edits a quote.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 27_000_000)
      throw new Error("INPUT_SIZE");
    const form = await request.formData();
    if (form.get("confirmed") !== "true")
      throw new Error("HUMAN_CONFIRMATION_REQUIRED");
    const issuerId = uuid(String(form.get("issuer_id") ?? ""));
    const quoteId = uuid(String(form.get("quote_id") ?? ""));
    const quote = await scopedRecord("quotes", quoteId, issuerId);
    if (quote.lifecycle !== "historical" || quote.origin !== "historical")
      throw new Error("LOGIFA_HISTORICAL_QUOTE_REQUIRED");

    const file = form.get("file");
    if (!(file instanceof File) || file.size < 5 || file.size > 26_214_400)
      throw new Error("PDF_REQUIRED");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-")
      throw new Error("PDF_REQUIRED");

    const db = await databaseForAdmin();
    const existing = await db.from("document_files").select("id")
      .eq("quote_id", quoteId).eq("role", "original").maybeSingle();
    if (existing.error) throw new Error("PDF_ARCHIVE_CHECK_FAILED");
    if (existing.data) throw new Error("PDF_ORIGINAL_ALREADY_LINKED");

    // Keep a stable object name so a failed registration can be retried safely
    // with identical bytes, without ever overwriting a stored original.
    const archived = await archivePdf({
      kind: "quote",
      documentId: quoteId,
      fileId: quoteId,
      role: "original",
      originalFilename: file.name,
      bytes,
    });
    return privateJson({ archived, quoteId });
  } catch (error) {
    return errorResponse(error);
  }
}
