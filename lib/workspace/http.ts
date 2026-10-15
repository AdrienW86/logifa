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
  const guidance: Record<string,string> = {
    LOGIFA_MANUAL_NUMBER_INVALID: "Vérifiez le numéro manuel et sa date. Format attendu : D-AAAAMJJ-XXXX.",
    LOGIFA_MANUAL_NUMBER_REASON: "Indiquez le motif de la saisie manuelle (10 à 500 caractères).",
    LOGIFA_MANUAL_NUMBER_SEQUENCE_MISMATCH: "Ce numéro ne suit pas la série actuelle. Actualisez la numérotation et vérifiez la dernière facture émise.",
    LOGIFA_MANUAL_NUMBER_DUPLICATE: "Ce numéro existe déjà pour cette entreprise. Vérifiez les factures avant de continuer.",
    LOGIFA_MANUAL_NUMBER_ALREADY_ISSUED: "Cette facture est déjà émise avec un autre numéro ou une autre date. Vérifiez le résultat de l’émission.",
    LOGIFA_NUMBER_CHRONOLOGY: "La date précède la dernière facture émise. Vérifiez la date du document.",
    LOGIFA_NUMBERING_RECONCILIATION_REQUIRED: "La série doit être vérifiée dans les réglages de numérotation. Votre préparation peut être conservée.",
    LOGIFA_OPERATION_AND_PAYMENT_DATES_REQUIRED: "Complétez la date de prestation, l’échéance et la nature des opérations avant d’émettre.",
    LOGIFA_FISCAL_PDF_CONFIGURATION_REQUIRED: "Complétez les coordonnées légales, les conditions de paiement et le pied de page dans les réglages de l’entreprise.",
  };
  return privateJson(
    {
      error: (code && guidance[code]) || code || "Opération impossible. Aucune confirmation de sauvegarde.",
      code,
    },
    code?.includes("CONFLICT") ? 409 : code ? 422 : 500,
  );
}
