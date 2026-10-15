const errors: Record<string, { status: number; message: string }> = {
  AGENT_PROVIDER_AUTH: {
    status: 503,
    message:
      "Clé OpenAI ou accès au modèle refusé. Vérifiez la configuration serveur.",
  },
  AGENT_PROVIDER_LIMIT: {
    status: 429,
    message:
      "Limite OpenAI atteinte. Vérifiez le quota et la facturation du projet avant de réessayer.",
  },
  LOGIFA_AGENT_RATE_LIMIT: {
    status: 429,
    message: "Limite partagée atteinte : dix demandes par heure et cinquante par jour, y compris les extractions PDF.",
  },
  AGENT_RATE_LIMIT: {
    status: 429,
    message: "Limite locale de dix demandes par heure atteinte.",
  },
  AGENT_NETWORK_ERROR: {
    status: 502,
    message:
      "OpenAI est injoignable ou le délai est dépassé. Aucune proposition appliquée.",
  },
  AGENT_PROVIDER_ERROR: {
    status: 502,
    message:
      "OpenAI a refusé la demande. Vérifiez notamment le modèle configuré.",
  },
  AGENT_INCOMPLETE: {
    status: 502,
    message:
      "Réponse OpenAI incomplète. Réduisez la demande ; aucune proposition appliquée.",
  },
  AGENT_RESPONSE_INVALID: {
    status: 502,
    message: "Réponse OpenAI invalide. Aucune proposition appliquée.",
  },
  AGENT_REFUSED: {
    status: 422,
    message: "OpenAI a refusé cette consigne. Aucune proposition appliquée.",
  },
  AGENT_INPUT_SIZE: {
    status: 422,
    message: "Demande trop volumineuse : réduisez les lignes ou la consigne.",
  },
  AGENT_PROMPT_REQUIRED: {
    status: 422,
    message: "Décrivez d’abord votre demande.",
  },
};

export function agentError(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  const entry = errors[error.message];
  return entry ? { ...entry, code: error.message } : undefined;
}
