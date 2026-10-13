import { requireAdmin } from "@/lib/auth/require-admin";
import { listTemplates, templateCommand } from "@/lib/services/email-templates";
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
    const issuer = uuid(new URL(request.url).searchParams.get("issuer") ?? "");
    return privateJson({ templates: await listTemplates(issuer) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    const body = await request.text();
    if (body.length > 30000) throw Error("INPUT_SIZE");
    const input = object(JSON.parse(body)),
      action = field(input, "action");
    if (action !== "history" && input.confirmed !== true)
      throw Error("HUMAN_CONFIRMATION_REQUIRED");
    return privateJson(
      await templateCommand(action, id(input, "issuer_id"), object(input.data)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
