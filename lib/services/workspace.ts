import "server-only";
import { databaseForAdmin } from "../supabase/server";
import { requireAdmin } from "../auth/require-admin";
import { isRecord } from "../editor/contracts";
import { uuid } from "../billing/validation";
import { checkedRpc, persistenceError } from "./billing";

export async function workspaceRead(issuer?: string) {
  await requireAdmin();
  const db = await databaseForAdmin();
  await checkedRpc(db, "logifa_workspace", { p_action: "health", p_data: {} });
  const lists: Record<string, Record<string, unknown>[]> = {};
  const truncated: string[] = [];
  for (const table of [
    "issuer_profiles",
    "legal_entities",
    "clients",
    "projects",
    "quotes",
    "invoices",
    "payments",
  ]) {
    let query = db.from(table).select("*", { count: "exact" });
    if (!["issuer_profiles", "legal_entities"].includes(table)) {
      if (!issuer) {
        lists[table] = [];
        continue;
      }
      uuid(issuer);
      query = query.eq("issuer_profile_id", issuer);
    }
    const { data, error, count } = await query.limit(500);
    if (error) throw persistenceError(error);
    const raw: unknown = data;
    if (!Array.isArray(raw) || !raw.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    lists[table] = raw;
    if (count && count > 500) truncated.push(table);
  }
  const invoiceIds = lists.invoices.map((row) => String(row.id)),
    quoteIds = lists.quotes.map((row) => String(row.id));
  const files: Record<string, unknown>[] = [];
  for (const [key, ids] of [
    ["invoice_id", invoiceIds],
    ["quote_id", quoteIds],
  ] as const) {
    if (!ids.length) continue;
    const { data, error } = await db
      .from("document_files")
      .select("*")
      .in(key, ids)
      .limit(500);
    if (error) throw persistenceError(error);
    const raw: unknown = data;
    if (!Array.isArray(raw) || !raw.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    const parents = key === "invoice_id" ? lists.invoices : lists.quotes;
    files.push(
      ...raw.map((file) => ({
        ...file,
        client_id: parents.find((parent) => parent.id === file[key])?.client_id,
      })),
    );
  }
  lists.document_files = files;
  const workflows: Record<string, unknown>[] = [];
  for (const [key, ids] of [
    ["invoice_id", invoiceIds],
    ["quote_id", quoteIds],
  ] as const) {
    if (!ids.length) continue;
    const { data, error } = await db
      .from("document_workflow")
      .select("*")
      .in(key, ids)
      .limit(500);
    if (error) throw persistenceError(error);
    const raw: unknown = data;
    if (!Array.isArray(raw) || !raw.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    workflows.push(...raw);
  }
  lists.document_workflow = workflows;
  const recordIds = [
    ...invoiceIds,
    ...quoteIds,
    ...lists.payments.map((row) => String(row.id)),
    ...lists.projects.map((row) => String(row.id)),
  ];
  if (recordIds.length) {
    const { data, error } = await db
      .from("document_events")
      .select("*")
      .in("record_id", recordIds)
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (error) throw persistenceError(error);
    const events: unknown = data;
    if (!Array.isArray(events) || !events.every(isRecord))
      throw new Error("PERSISTENCE_RESPONSE_INVALID");
    lists.document_events = events;
  } else lists.document_events = [];
  const balances: Record<string, Record<string, unknown>> = {};
  for (const row of lists.invoices)
    if (row.lifecycle !== "draft")
      balances[String(row.id)] = await checkedRpc(
        db,
        "logifa_invoice_balance",
        { p_invoice: row.id },
      );
  const context = await checkedRpc(db, "logifa_context");
  const capability = await db.rpc("logifa_client_lifecycle", {
    p_action: "health",
  });
  if (
    capability.error &&
    !["PGRST202", "42883"].includes(capability.error.code)
  )
    throw persistenceError(capability.error);
  const archives = await db.rpc("logifa_archive_pending");
  if (archives.error && !["PGRST202", "42883"].includes(archives.error.code))
    throw persistenceError(archives.error);
  return {
    available: true,
    lists,
    balances,
    truncated,
    context,
    clientLifecycle:
      !capability.error &&
      isRecord(capability.data) &&
      capability.data.available === true,
    archiveRecovery:
      !archives.error &&
      isRecord(archives.data) &&
      Array.isArray(archives.data.items),
  };
}
export async function scopedRecord(
  table: "quotes" | "invoices" | "payments" | "clients" | "projects",
  id: string,
  issuer: string,
) {
  await requireAdmin();
  uuid(id);
  uuid(issuer);
  const db = await databaseForAdmin();
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("issuer_profile_id", issuer)
    .single();
  if (error) throw new Error("LOGIFA_SCOPE_NOT_FOUND");
  const row: unknown = data;
  if (!isRecord(row)) throw new Error("PERSISTENCE_RESPONSE_INVALID");
  return row;
}
export async function issuerContext(issuer: string) {
  await requireAdmin();
  uuid(issuer);
  const db = await databaseForAdmin();
  const { data, error } = await db
    .from("issuer_profiles")
    .select("id,commercial_name,active")
    .eq("id", issuer)
    .single();
  const row: unknown = data;
  if (error || !isRecord(row) || row.active !== true)
    throw new Error("LOGIFA_SCOPE_NOT_FOUND");
  return { id: row.id, name: row.commercial_name };
}
export async function workspaceCommand(
  action: string,
  data: Record<string, unknown>,
) {
  await requireAdmin();
  const db = await databaseForAdmin();
  if (action === "reactivate-client" || action === "delete-client") {
    uuid(String(data.issuer_id));
    uuid(String(data.id));
    if (action === "delete-client" && data.confirmation !== "SUPPRIMER")
      throw new Error("LOGIFA_DELETE_CONFIRMATION_REQUIRED");
    return checkedRpc(db, "logifa_client_lifecycle", {
      p_action: action === "reactivate-client" ? "reactivate" : "delete",
      p_issuer: data.issuer_id,
      p_client: data.id,
      p_confirmation: data.confirmation ?? null,
    });
  }
  return checkedRpc(db, "logifa_workspace", { p_action: action, p_data: data });
}
