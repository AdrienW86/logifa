import type { EditorDraft } from "../../types/editor";
import catalog from "../../app/prestations.ts";

/** Only document content needed for a proposal; no stored contact or financial history. */
export function proposalContext(
  draft: EditorDraft, issuer: { name: string },
  approvedTariffs: {name:string;unit:string;price:number;category:string}[] = [],
) {
  if (draft.lines.length > 100) throw new Error("AGENT_INPUT_SIZE");
  return {
    issuer: { name: issuer.name },
    client: { name: draft.client.name },
    kind: draft.kind,
    existingLines: draft.lines.map(
      ({ key, type, name, quantity, unit, price, tva }) => ({
        key,
        type,
        name,
        quantity,
        unit,
        price,
        tva,
      }),
    ),
    // Shared legacy catalogue is for offline/local editing only. An issuer
    // with server identity must not inherit unrelated companies' tariffs.
    catalogue: draft.issuerScope ? approvedTariffs : catalog,
  };
}
