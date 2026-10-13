import "server-only";
import { requireAdmin } from "../auth/require-admin";
import { databaseForAdmin } from "../supabase/server";
import { checkedRpc } from "./billing";
import { uuid } from "../billing/validation";
import { field } from "../workspace/input";
import {
  initialDesign,
  parseDesign,
  parseTemplate,
  templateKinds,
  type EmailTemplate,
} from "../email/templates";
export async function templateCommand(
  action: string,
  issuer: string,
  input: Record<string, unknown> = {},
) {
  await requireAdmin();
  uuid(issuer);
  let data: Record<string, unknown>;
  if (action === "initialize")
    data = {
      templates: templateKinds.map((kind) => ({
        name: initialDesign(kind).subject.split(" {{")[0],
        kind,
        design: initialDesign(kind),
      })),
    };
  else if (action === "save") {
    const kind = field(input, "kind");
    if (!templateKinds.some((k) => k === kind))
      throw Error("MAIL_TEMPLATE_KIND_INVALID");
    const name = field(input, "name");
    if (name.length > 100) throw Error("MAIL_TEMPLATE_NAME_INVALID");
    data = {
      name,
      kind,
      design: parseDesign(input.design),
      is_default: input.is_default === true,
    };
    if (input.id) {
      data.id = uuid(field(input, "id"));
      data.revision = input.revision;
    }
  } else if (
    ["duplicate", "archive", "restore", "default", "history"].includes(action)
  )
    data = { id: uuid(field(input, "id")), revision: input.revision };
  else if (action === "list") data = {};
  else throw Error("MAIL_TEMPLATE_ACTION_INVALID");
  if (
    data.id &&
    action !== "history" &&
    (typeof data.revision !== "number" ||
      !Number.isSafeInteger(data.revision) ||
      data.revision < 1)
  )
    throw Error("MAIL_TEMPLATE_VERSION_REQUIRED");
  return checkedRpc(await databaseForAdmin(), "logifa_email_templates", {
    p_action: action,
    p_issuer: issuer,
    p_data: data,
  });
}
export async function listTemplates(issuer: string): Promise<EmailTemplate[]> {
  const response = await templateCommand("list", issuer);
  if (!Array.isArray(response.templates))
    throw Error("MAIL_TEMPLATE_RESPONSE_INVALID");
  return response.templates.map(parseTemplate);
}
export async function selectedTemplate(
  issuer: string,
  input: Record<string, unknown>,
) {
  if (!input.template_id) return null;
  const id = uuid(field(input, "template_id"));
  const template = (await listTemplates(issuer)).find(
    (t) => t.id === id && !t.archived,
  );
  if (!template || template.revision !== input.template_revision)
    throw Error("MAIL_TEMPLATE_VERSION_CONFLICT");
  return template;
}
