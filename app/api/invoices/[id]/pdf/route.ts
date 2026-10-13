import { requireAdmin } from "@/lib/auth/require-admin";
import {
  managedInvoiceBytes,
  archiveManagedInvoice,
} from "@/lib/services/managed-pdf";
import {
  errorResponse,
  mutationOrigin,
  privateJson,
} from "@/lib/workspace/http";
import { uuid } from "@/lib/billing/validation";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const bytes = await managedInvoiceBytes(
      uuid(id),
      uuid(query.get("issuer") ?? ""),
      query.get("paid") === "1",
    );
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="facture.pdf"',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    const { id } = await params,
      query = new URL(request.url).searchParams;
    if (query.get("confirmed") !== "1")
      throw new Error("HUMAN_CONFIRMATION_REQUIRED");
    return privateJson(
      await archiveManagedInvoice(
        uuid(id),
        uuid(query.get("issuer") ?? ""),
        query.get("paid") === "1",
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
