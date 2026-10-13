import { requireAdmin } from "@/lib/auth/require-admin";
import {
  configureMail,
  mailState,
  verifyMail,
  previewMail,
  sendMail,
} from "@/lib/services/mail";
import {
  mutationOrigin,
  errorResponse,
  privateJson,
} from "@/lib/workspace/http";
import { field, id, object } from "@/lib/workspace/input";
import { uuid } from "@/lib/billing/validation";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    return privateJson(
      await mailState(
        uuid(new URL(request.url).searchParams.get("issuer") ?? ""),
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    const text = await request.text();
    if (text.length > 30000) throw new Error("INPUT_SIZE");
    const input = object(JSON.parse(text)),
      issuer = id(input, "issuer_id"),
      action = field(input, "action"),
      data = object(input.data);
    if (action !== "preview" && input.confirmed !== true)
      throw new Error("HUMAN_CONFIRMATION_REQUIRED");
    if (action === "configure")
      return privateJson(await configureMail(issuer, data));
    if (action === "verify") return privateJson(await verifyMail(issuer));
    if (action === "preview")
      return privateJson(await previewMail(issuer, data));
    if (action === "send")
      return privateJson(await sendMail(issuer, { ...data, confirmed: true }));
    throw new Error("MAIL_ACTION");
  } catch (e) {
    return errorResponse(e);
  }
}
