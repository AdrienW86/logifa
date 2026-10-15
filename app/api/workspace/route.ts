import { requireAdmin } from "@/lib/auth/require-admin";
import {
  workspaceRead,
  workspaceCommand,
  scopedRecord,
} from "@/lib/services/workspace";
import { importCompanyProfiles } from "@/lib/services/companies";
import { billingService } from "@/lib/services/billing";
import { companies } from "@/app/company";
import {
  field,
  id,
  object,
  documentInput,
  optionalId,
  requireConfirmation,
} from "@/lib/workspace/input";
import {
  errorResponse,
  mutationOrigin,
  privateJson,
} from "@/lib/workspace/http";
import { isDraftShape, isRecord } from "@/lib/editor/contracts";
import { databaseForAdmin } from "@/lib/supabase/server";
import { checkedRpc, persistenceError } from "@/lib/services/billing";
import { validateMaster } from "@/lib/workspace/master-validation";
import { isoDate } from "@/lib/billing/validation";
import { recoverPendingArchives } from "@/lib/services/archive";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = new URL(request.url).searchParams;
    if (query.get("document")) {
      const issuer = query.get("issuer") ?? "",
        doc = query.get("document") ?? "",
        kind = query.get("kind") === "quote" ? "quotes" : "invoices";
      const row = await scopedRecord(kind, doc, issuer),
        db = await databaseForAdmin();
      const saved = await db
        .from("editor_drafts")
        .select("*")
        .eq(kind === "quotes" ? "quote_id" : "invoice_id", doc)
        .maybeSingle();
      if (saved.error) throw persistenceError(saved.error);
      return privateJson({ row, draft: saved.data });
    }
    return privateJson(await workspaceRead(query.get("issuer") ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 2097152)
      throw new Error("INPUT_SIZE");
    const raw = await request.text();
    if (raw.length > 2097152) throw new Error("INPUT_SIZE");
    const input = object(JSON.parse(raw)),
      action = field(input, "action"),
      data = object(input.data);
    if (action === "import-companies") {
      requireConfirmation(input);
      return privateJson(await importCompanyProfiles(companies));
    }
    if (action === "recover-archives") {
      requireConfirmation(input);
      return privateJson(await recoverPendingArchives());
    }
    if (
      [
        "legal",
        "issuer",
        "client",
        "project",
        "archive-client",
        "reactivate-client",
        "delete-client",
        "deactivate-issuer",
        "workflow",
        "delete-draft",
      ].includes(action)
    ) {
      requireConfirmation(input);
      validateMaster(action, data);
      if (
        [
          "archive-client",
          "reactivate-client",
          "delete-client",
          "deactivate-issuer",
          "workflow",
          "delete-draft",
        ].includes(action)
      )
        id(data, "issuer_id");
      return privateJson(await workspaceCommand(action, data));
    }
    const issuer = id(data, "issuer_id");
    if (action === "save") {
      const document = documentInput(data.document);
      if (document.issuer_profile_id !== issuer)
        throw new Error("LOGIFA_SCOPE_MISMATCH");
      await scopedRecord("clients", document.client_id, issuer);
      if (!isDraftShape(data.payload)) throw new Error("INPUT_DRAFT");
      if (data.payload.issuerScope !== issuer)
        throw new Error("LOGIFA_SCOPE_MISMATCH");
      const kind = field(data, "kind");
      if (kind === "invoice" && data.payload.fiscal) {
        for (const date of [
          data.payload.fiscal.operationDate,
          data.payload.fiscal.dueDate,
        ])
          if (date) isoDate(date);
      }
      if (kind === "invoice")
        for (const key of ["operation_date", "due_date"])
          if (data[key]) isoDate(field(data, key));
      if (kind !== "quote" && kind !== "invoice") throw new Error("INPUT_KIND");
      if (data.payload.kind !== (kind === "quote" ? "devis" : "facture"))
        throw new Error("INPUT_KIND");
      if (data.id)
        await scopedRecord(
          kind === "quote" ? "quotes" : "invoices",
          id(data, "id"),
          issuer,
        );
      return privateJson(await workspaceCommand("save", { ...data, document }));
    }
    requireConfirmation(input);
    if (action === "issue") {
      const kind = field(data, "kind");
      if (kind !== "quote" && kind !== "invoice") throw new Error("INPUT_KIND");
      const row = await scopedRecord(
        kind === "quote" ? "quotes" : "invoices",
        id(data, "id"),
        issuer,
      );
      if (
        kind === "invoice" &&
        (!row.operation_date || !row.due_date || !row.operation_category)
      )
        throw new Error("LOGIFA_OPERATION_AND_PAYMENT_DATES_REQUIRED");
      const db = await databaseForAdmin(),
        entity = await db
          .from("legal_entities")
          .select("*")
          .eq("id", row.legal_entity_id)
          .single();
      const legal: unknown = entity.data;
      if (
        entity.error ||
        !isRecord(legal) ||
        !isRecord(legal.legal_mentions) ||
        typeof legal.legal_mentions.payment_terms !== "string" ||
        typeof legal.legal_mentions.pdf_footer !== "string" ||
        !legal.legal_mentions.pdf_footer.trim() ||
        legal.vat_exigibility === "unknown" ||
        typeof legal.siret !== "string" ||
        !legal.siret.trim()
      )
        throw new Error("LOGIFA_FISCAL_PDF_CONFIGURATION_REQUIRED");
      return privateJson(
        await billingService.issue(kind, id(data, "id"), field(data, "date")),
      );
    }
    if (action === "payment") {
      await scopedRecord("clients", id(data, "client_id"), issuer);
      const qualification = data.qualification;
      if (
        qualification !== "deposit" &&
        qualification !== "earnest" &&
        qualification !== "unqualified"
      )
        throw new Error("QUALIFICATION_REQUIRED");
      return privateJson(
        await billingService.recordPayment({
          issuer_profile_id: issuer,
          client_id: id(data, "client_id"),
          amount_minor: field(data, "amount_minor"),
          received_on: field(data, "received_on"),
          method: field(data, "method"),
          qualification,
          idempotency_key: id(data, "key"),
          quote_id: optionalId(data, "quote_id"),
          project_id: optionalId(data, "project_id"),
          bank_reference: field(data, "bank_reference", true) || undefined,
          notes: field(data, "notes", true) || undefined,
        }),
      );
    }
    if (action === "allocate") {
      await scopedRecord("payments", id(data, "payment_id"), issuer);
      await scopedRecord("invoices", id(data, "invoice_id"), issuer);
      return privateJson(
        await billingService.allocate(
          id(data, "payment_id"),
          id(data, "invoice_id"),
          field(data, "amount_minor"),
          id(data, "key"),
        ),
      );
    }
    if (action === "refund") {
      await scopedRecord("payments", id(data, "payment_id"), issuer);
      return privateJson(
        await billingService.refund(
          id(data, "payment_id"),
          field(data, "amount_minor"),
          field(data, "date"),
          field(data, "method"),
          id(data, "key"),
          optionalId(data, "allocation_id") ?? null,
        ),
      );
    }
    if (action === "link-all-deposits") {
      await scopedRecord("invoices", id(data,"final_id"), issuer);
      return privateJson(await checkedRpc(await databaseForAdmin(),
        "logifa_link_all_deposits", {
          p_issuer: issuer,
          p_final: id(data,"final_id"),
        }));
    }
    if (action === "link-deposit") {
      await scopedRecord("invoices", id(data, "final_id"), issuer);
      await scopedRecord("invoices", id(data, "deposit_id"), issuer);
      return privateJson(
        await billingService.linkDeposit(
          id(data, "final_id"),
          id(data, "deposit_id"),
        ),
      );
    }
    if (action === "apply-credit") {
      await scopedRecord("invoices", id(data, "credit_id"), issuer);
      await scopedRecord("invoices", id(data, "invoice_id"), issuer);
      return privateJson(
        await billingService.applyCredit(
          id(data, "credit_id"),
          id(data, "invoice_id"),
          field(data, "amount_minor"),
          id(data, "key"),
        ),
      );
    }
    throw new Error("INPUT_ACTION");
  } catch (error) {
    return errorResponse(error);
  }
}
