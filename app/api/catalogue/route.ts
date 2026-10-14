import { requireAdmin } from "@/lib/auth/require-admin";
import { databaseForAdmin } from "@/lib/supabase/server";
import { checkedRpc } from "@/lib/services/billing";
import { errorResponse, mutationOrigin, privateJson } from "@/lib/workspace/http";
import { isRecord } from "@/lib/editor/contracts";
import { uuid } from "@/lib/billing/validation";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const issuer = uuid(new URL(request.url).searchParams.get("issuer") ?? "");
    return privateJson(await checkedRpc(await databaseForAdmin(),
      "logifa_issuer_tariffs",{p_action:"list",p_issuer:issuer,p_data:{}}));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0)>150000)
      throw new Error("INPUT_SIZE");
    const raw: unknown = await request.json();
    if (!isRecord(raw) || raw.confirmed !== true ||
        typeof raw.issuer !== "string" || typeof raw.action !== "string")
      throw new Error("HUMAN_CONFIRMATION_REQUIRED");
    const issuer = uuid(raw.issuer);
    if (!["suggest_from_quote","approve","archive"].includes(raw.action))
      throw new Error("TARIFF_ACTION_INVALID");
    let data: Record<string,unknown>;
    if (raw.action === "suggest_from_quote") {
      if (typeof raw.quote_id !== "string" || !Array.isArray(raw.items))
        throw new Error("TARIFF_SOURCE_REQUIRED");
      data = { quote_id:uuid(raw.quote_id),items:raw.items };
    } else {
      if (typeof raw.id !== "string") throw new Error("TARIFF_NOT_FOUND");
      data = {id:uuid(raw.id)};
    }
    const result = await checkedRpc(await databaseForAdmin(),"logifa_issuer_tariffs",{
      p_action:raw.action,p_issuer:issuer,p_data:data,
    });
    return privateJson(result);
  } catch (error) { return errorResponse(error); }
}
