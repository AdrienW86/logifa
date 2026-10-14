import { requireAdmin } from "@/lib/auth/require-admin";
import {
  errorResponse,
  mutationOrigin,
  privateJson,
} from "@/lib/workspace/http";
import { agentEnabled, proposeWithOpenAI } from "@/lib/agent/openai";
import { validatedAgentProposal } from "@/lib/agent/proposal";
import { isDraftShape, isRecord } from "@/lib/editor/contracts";
import { checkedRpc } from "@/lib/services/billing";
import { databaseForAdmin } from "@/lib/supabase/server";
import { object, field } from "@/lib/workspace/input";
import { companies } from "@/app/company";
import { proposalContext } from "@/lib/agent/context";
import { agentError } from "@/lib/agent/errors";
import { issuerContext } from "@/lib/services/workspace";
export async function GET() {
  try {
    await requireAdmin();
    return privateJson({ enabled: agentEnabled() });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    mutationOrigin(request);
    if (!agentEnabled())
      return privateJson(
        {
          error: "Agent désactivé. Aucun appel OpenAI effectué.",
          code: "AGENT_NOT_ENABLED",
        },
        503,
      );
    const text = await request.text();
    if (text.length > 200000) throw new Error("INPUT_SIZE");
    const input = object(JSON.parse(text));
    if (input.confirmed !== true)
      throw new Error("HUMAN_CONFIRMATION_REQUIRED");
    if (!isDraftShape(input.draft)) throw new Error("INPUT_DRAFT");
    const prompt = field(input, "prompt"),
      draft = input.draft;
    const issuer = draft.issuerScope
      ? await issuerContext(draft.issuerScope)
      : {
          name:
            companies[Number(draft.companyKey.replace("local-issuer-", ""))]
              ?.name ?? "",
        };
    if (typeof issuer.name !== "string" || !issuer.name.trim())
      throw new Error("INPUT_ISSUER");
    const tariffs = draft.issuerScope
      ? await checkedRpc(await databaseForAdmin(), "logifa_issuer_tariffs", {
          p_action:"approved",p_issuer:draft.issuerScope,p_data:{},
        })
      : {};
    const items:unknown = tariffs.items;
    const approvedCatalogue = Array.isArray(items) ?
      items.filter(isRecord).map((item) => ({
        name: typeof item.description === "string" ? item.description : "",
        unit: typeof item.unit === "string" ? item.unit : "",
        price: Number(item.price_ht),
        category: "Tarifs approuvés",
      })).filter((item) => item.name && item.unit &&
        Number.isFinite(item.price) && item.price >= 0).slice(0,200) : [];
    const context = proposalContext(draft, { name: issuer.name }, approvedCatalogue);
    const raw = await proposeWithOpenAI(admin, prompt, context);
    const result = validatedAgentProposal(raw, prompt, draft, companies, approvedCatalogue);
    const diagnostics = {
      ...result.diagnostics,
      request: {
        promptCharacters: prompt.length,
        hasIssuer: Boolean(context.issuer.name),
        hasClient: Boolean(context.client.name),
        catalogueEntries: context.catalogue.length,
        existingLines: context.existingLines.length,
      },
    };
    if (!result.proposal.lines?.length && !result.proposal.lineUpdates?.length)
      return privateJson(
        {
          error:
            "Aucune prestation exploitable reçue. Précisez les travaux ou modifiez les lignes manuellement. Aucun champ appliqué." +
            (result.proposal.priceSources?.length
              ? " " +
                result.proposal.priceSources
                  .map((source) => source.text)
                  .join(" ; ")
              : ""),
          code: "AGENT_NO_LINES",
          diagnostics,
        },
        422,
      );
    return privateJson({ ...result, diagnostics });
  } catch (e) {
    const failure = agentError(e);
    if (failure)
      return privateJson(
        { error: failure.message, code: failure.code },
        failure.status,
      );
    return errorResponse(e);
  }
}
