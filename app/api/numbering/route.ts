import { requireAdmin } from "@/lib/auth/require-admin";
import { databaseForAdmin } from "@/lib/supabase/server";
import { checkedRpc } from "@/lib/services/billing";
import { uuid } from "@/lib/billing/validation";
import { isRecord } from "@/lib/editor/contracts";
import { errorResponse, mutationOrigin, privateJson } from "@/lib/workspace/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const issuer = uuid(new URL(request.url).searchParams.get("issuer") ?? "");
    return privateJson(await checkedRpc(await databaseForAdmin(),"logifa_invoice_numbering",{
      p_action:"status",p_issuer:issuer,p_data:{},
    }));
  } catch(error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 10000)
      throw new Error("INPUT_SIZE");
    const body: unknown = await request.json();
    if (!isRecord(body) || body.confirmed !== true ||
      typeof body.issuer !== "string" ||
      typeof body.last_number !== "string" ||
      typeof body.last_date !== "string" ||
      typeof body.evidence !== "string" ||
      body.confirmation !== "JE CONFIRME LA SERIE")
      throw new Error("LOGIFA_NUMBERING_CONFIRMATION_REQUIRED");
    if (body.evidence.length > 2000 || body.last_number.length > 30)
      throw new Error("INPUT_SIZE");
    return privateJson(await checkedRpc(await databaseForAdmin(),"logifa_invoice_numbering",{
      p_action:"reconcile",
      p_issuer:uuid(body.issuer),
      p_data:{
        last_number:body.last_number.trim(),
        last_date:body.last_date,
        evidence:body.evidence.trim(),
        confirmation:body.confirmation,
      },
    }));
  } catch(error) { return errorResponse(error); }
}
