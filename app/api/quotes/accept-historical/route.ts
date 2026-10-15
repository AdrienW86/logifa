import { requireAdmin } from "@/lib/auth/require-admin";
import { databaseForAdmin } from "@/lib/supabase/server";
import { scopedRecord } from "@/lib/services/workspace";
import { checkedRpc, persistenceError } from "@/lib/services/billing";
import { verifiedPdf } from "@/lib/services/archive";
import { uuid } from "@/lib/billing/validation";
import { isRecord } from "@/lib/editor/contracts";
import { errorResponse, mutationOrigin, privateJson } from "@/lib/workspace/http";

/** Historical quote acceptance is a documented human decision, not AI inference. */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0)>5000)
      throw new Error("INPUT_SIZE");
    const body: unknown = await request.json();
    if (!isRecord(body) || body.confirmed !== true ||
      typeof body.issuer !== "string" || typeof body.quote_id !== "string" ||
      typeof body.evidence !== "string" || body.evidence.trim().length<15 ||
      body.evidence.length>2000)
      throw new Error("LOGIFA_ACCEPTANCE_EVIDENCE");
    const issuer=uuid(body.issuer), quote=uuid(body.quote_id);
    const original=await scopedRecord("quotes",quote,issuer);
    if (original.lifecycle!=="historical" || original.origin!=="historical")
      throw new Error("LOGIFA_HISTORICAL_QUOTE_REQUIRED");
    const db=await databaseForAdmin();
    const res=await db.from("document_files")
      .select("id,role").eq("quote_id",quote).in("role",["original","signed"]).limit(10);
    if (res.error) throw persistenceError(res.error);
    const file=res.data?.find((item)=>item.role==="signed") ??
      res.data?.find((item)=>item.role==="original");
    if (!file) throw new Error("PDF_ORIGINAL_REQUIRED");
    await verifiedPdf(String(file.id));
    return privateJson(await checkedRpc(db,"logifa_accept_historical_quote",{
      p_issuer:issuer,p_quote:quote,p_evidence:body.evidence.trim(),
    }));
  } catch(error) {return errorResponse(error);}
}
