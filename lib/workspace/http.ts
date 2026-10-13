import { AdminAccessError } from "../auth/require-admin";
export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function mutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("ORIGIN_NOT_ALLOWED");
}
export function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError)
    return privateJson(
      { error: "Données JSON invalides.", code: "INPUT_JSON" },
      422,
    );
  if (error instanceof AdminAccessError)
    return privateJson({ error: "Accès non autorisé." }, error.status);
  const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
  if (message.startsWith("PERSISTENCE_"))
    return privateJson(
      {
        error:
          "Persistance indisponible. Configurez et validez Supabase ; aucune sauvegarde serveur effectuée.",
        code: message,
      },
      503,
    );
  const code = message.match(/^(LOGIFA_[A-Z_]+|INPUT_[A-Z_]+|[A-Z_]+)$/)?.[0];
  return privateJson(
    {
      error: code ?? "Opération impossible. Aucune confirmation de sauvegarde.",
      code,
    },
    code?.includes("CONFLICT") ? 409 : code ? 422 : 500,
  );
}
