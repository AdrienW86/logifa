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
    LOGIFA_ACCEPTED_QUOTE_REQUIRED: "Le devis d'origine n'est pas encore accepté. Vérifiez l'accord réel du client sur le document historique, puis utilisez « Valider l'accord client vérifié » avant d'émettre la facture.",
    LOGIFA_ACCEPTANCE_EVIDENCE: "Indiquez la preuve vérifiée de l'accord du client (15 caractères minimum). Aucun statut n'a été modifié.",
    PDF_ORIGINAL_REQUIRED: "Le PDF original du devis historique doit être archivé avant la validation de l'accord.",
    LOGIFA_ENTITY_REVIEW_REQUIRED: "L'identité fiscale de l'entreprise doit être vérifiée et validée avant l'émission.",
    LOGIFA_FINAL_UNLINKED_DEPOSITS: "La facture de solde doit déduire tous les acomptes déjà émis sur ce devis ou chantier.",
    LOGIFA_FINAL_CONTEXT_REQUIRED: "Une facture de solde doit être liée à un devis ou à un chantier.",
    LOGIFA_VAT_REGIME: "Les montants de TVA de la facture sont incompatibles avec le régime fiscal enregistré.",
    LOGIFA_PDF_MENTIONS_REQUIRED: "Complétez les conditions de paiement et les mentions légales du PDF dans les réglages fiscaux.",
  };
  return privateJson(
    {
      error: (code && guidance[code]) || code || "Opération impossible. Aucune confirmation de sauvegarde.",
      code,
    },
    code?.includes("CONFLICT") ? 409 : code ? 422 : 500,
  );
}
