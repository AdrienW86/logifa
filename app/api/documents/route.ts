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
    let document: Record<string, unknown>;
    if (existing) {
      document = await scopedRecord(
        kind === "quote" ? "quotes" : "invoices",
        existing,
        issuer,
      );
      if (document.client_id !== client)
        throw new Error("LOGIFA_CLIENT_ISSUER_MISMATCH");
    } else
      document = await billingService.importHistorical(kind, {
        issuer_profile_id: issuer,
        client_id: client,
        number: string("number"),
        issue_date: string("date"),
        original_status: string("status"),
        import_key: data.has("import_key")
          ? uuid(string("import_key"))
          : randomUUID(),
        total_net: string("total_net"),
        total_vat: string("total_vat"),
        total_gross: string("total_gross"),
      });
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
