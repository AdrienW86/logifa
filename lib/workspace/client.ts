import { isRecord } from "../editor/contracts";
export type Row = Record<string, unknown>;
export type WorkspaceData = {
  available: boolean;
  lists: Record<string, Row[]>;
  balances: Record<string, Row>;
  truncated: string[];
  clientLifecycle?: boolean;
  archiveRecovery?: boolean;
};
export const value = (row: Row, key: string) =>
  typeof row[key] === "string" || typeof row[key] === "number"
    ? String(row[key])
    : "";
export function parseWorkspace(raw: unknown): WorkspaceData {
  if (
    !isRecord(raw) ||
    raw.available !== true ||
    !isRecord(raw.lists) ||
    !isRecord(raw.balances) ||
    !Array.isArray(raw.truncated) ||
    !raw.truncated.every((v) => typeof v === "string")
  )
    throw new Error("Réponse serveur incompatible.");
  const lists: Record<string, Row[]> = {},
    balances: Record<string, Row> = {};
  for (const [key, rows] of Object.entries(raw.lists)) {
    if (!Array.isArray(rows) || !rows.every(isRecord))
      throw new Error("Liste incompatible.");
    lists[key] = rows;
  }
  for (const [key, row] of Object.entries(raw.balances)) {
    if (!isRecord(row)) throw new Error("Solde incompatible.");
    balances[key] = row;
  }
  return {
    available: true,
    lists,
    balances,
    truncated: raw.truncated,
    clientLifecycle: raw.clientLifecycle === true,
    archiveRecovery: raw.archiveRecovery === true,
  };
}
export async function api(url: string, init?: RequestInit): Promise<Row> {
  const response = await fetch(url, { ...init, cache: "no-store" }),
    raw: unknown = await response.json();
  if (!isRecord(raw)) throw new Error("Réponse serveur incompatible.");
  if (!response.ok)
    throw new Error(
      typeof raw.error === "string"
        ? `${raw.error}${typeof raw.code === "string" ? " (" + raw.code + ")" : ""}`
        : "Opération refusée.",
    );
  return raw;
}
export function command(action: string, data: Row, confirmed = false) {
  return api("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data, confirmed }),
  });
}
export const selectedIssuer = (userId: string) =>
  typeof window === "undefined"
    ? ""
    : (sessionStorage.getItem(`logifa:issuer:${userId}`) ?? "");
export function selectIssuer(userId: string, id: string) {
  sessionStorage.setItem(`logifa:issuer:${userId}`, id);
  window.dispatchEvent(new Event("logifa:issuer"));
}
