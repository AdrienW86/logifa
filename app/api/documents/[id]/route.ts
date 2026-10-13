import { requireAdmin } from "@/lib/auth/require-admin";
import { verifiedPdf } from "@/lib/services/archive";
import { databaseForAdmin } from "@/lib/supabase/server";
import { scopedRecord } from "@/lib/services/workspace";
import { uuid } from "@/lib/billing/validation";
import { errorResponse } from "@/lib/workspace/http";
import { isRecord } from "@/lib/editor/contracts";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    uuid(id);
    const issuer = uuid(new URL(request.url).searchParams.get("issuer") ?? "");
    const db = await databaseForAdmin(),
      response = await db
        .from("document_files")
        .select("*")
        .eq("id", id)
        .single(),
      row: unknown = response.data;
    if (response.error || !isRecord(row))
      throw new Error("LOGIFA_FILE_NOT_FOUND");
    if (typeof row.invoice_id === "string")
      await scopedRecord("invoices", row.invoice_id, issuer);
    else if (typeof row.quote_id === "string")
      await scopedRecord("quotes", row.quote_id, issuer);
    else throw new Error("LOGIFA_SCOPE_NOT_FOUND");
    const bytes = await verifiedPdf(id);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="document.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
