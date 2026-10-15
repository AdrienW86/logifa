import "server-only";
import { createHash } from "node:crypto";
import { databaseForAdmin } from "../supabase/server";
import { requireAdmin } from "../auth/require-admin";
import { checkedRpc } from "./billing";
import { scopedRecord } from "./workspace";
import { verifiedPdf } from "./archive";
import { field, id } from "../workspace/input";
import { isRecord } from "../editor/contracts";
import {
  masterKey,
  sealKey,
  unsealKey,
  signPreview,
  checkPreview,
} from "../email/crypto";
import { email, domainFor, ResendAccount } from "../email/resend";
import { selectedTemplate } from "./email-templates";
import { renderEmail, type TemplateContext } from "../email/templates";

const activeKey = () => masterKey(process.env.LOGIFA_EMAIL_ENCRYPTION_KEY);
export const sendingEnabled = () => process.env.LOGIFA_EMAIL_ENABLED === "true";
async function rpc(
  action: string,
  issuer: string,
  data: Record<string, unknown> = {},
) {
  await requireAdmin();
  const db = await databaseForAdmin();
  return checkedRpc(db, "logifa_mail", {
    p_action: action,
    p_issuer: issuer,
    p_data: data,
  });
}
export async function mailState(issuer: string) {
  return {
    ...(await rpc("state", issuer)),
    sending_enabled: sendingEnabled(),
    encryption_configured: Boolean(process.env.LOGIFA_EMAIL_ENCRYPTION_KEY),
  };
}
export async function configureMail(
  issuer: string,
  input: Record<string, unknown>,
) {
  await requireAdmin();
  const from = email(field(input, "from_email")),
    reply = email(field(input, "reply_to")),
    domain = field(input, "domain").toLowerCase(),
    name = field(input, "sender_name");
  if (domainFor(from) !== domain || /[<>\r\n]/.test(name))
    throw new Error("MAIL_SENDER_IDENTITY_INVALID");
  const secret = field(input, "api_key", true),
    key = activeKey();
  return rpc("configure", issuer, {
    sender_name: name,
    from_email: from,
    reply_to: reply,
    domain,
    signature: field(input, "signature", true),
    default_subject: field(input, "default_subject", true),
    default_body: field(input, "default_body", true),
    ...(secret ? { encrypted_key: sealKey(secret, issuer, key) } : {}),
  });
}
async function credentials(issuer: string) {
  const data = await rpc("credentials", issuer),
    keys = [activeKey()];
  if (process.env.LOGIFA_EMAIL_PREVIOUS_ENCRYPTION_KEY)
    keys.push(masterKey(process.env.LOGIFA_EMAIL_PREVIOUS_ENCRYPTION_KEY));
  return {
    data,
    provider: new ResendAccount(unsealKey(data.encrypted_key, issuer, keys)),
  };
}
export async function verifyMail(issuer: string) {
  const { data, provider } = await credentials(issuer),
    domain = field(data, "domain");
  const verified = await provider.verifiedDomain(domain);
  return rpc("verified", issuer, {
    key_version: data.key_version,
    status: verified ? "verified" : "failed",
  });
}
async function message(issuer: string, input: Record<string, unknown>) {
  await requireAdmin();
  const kind = field(input, "kind");
  if (kind !== "quote" && kind !== "invoice")
    throw new Error("MAIL_DOCUMENT_KIND");
  const documentId = id(input, "document_id"),
    record = await scopedRecord(
      kind === "quote" ? "quotes" : "invoices",
      documentId,
      issuer,
    );
  if (record.lifecycle !== "issued" && record.lifecycle !== "historical")
    throw new Error("MAIL_ISSUED_DOCUMENT_REQUIRED");
  const account = await rpc("state", issuer);
  if (account.configured !== true) throw new Error("MAIL_NOT_CONFIGURED");
  const db = await databaseForAdmin();
  const template = await selectedTemplate(issuer, input);
  if (
    template &&
    ((kind === "quote" && !["quote", "reminder"].includes(template.kind)) ||
      (kind === "invoice" && template.kind === "quote") ||
      (template.kind === "deposit" && record.document_kind !== "deposit"))
  )
    throw Error("MAIL_TEMPLATE_DOCUMENT_KIND");
  let remaining = "",
    paid = false;
  if (template && kind === "invoice") {
    const balance = await checkedRpc(db, "logifa_invoice_balance", {
      p_invoice: documentId,
    });
    remaining = (Number(balance.remaining_minor) / 100).toLocaleString(
      "fr-FR",
      { style: "currency", currency: "EUR" },
    );
    paid = balance.is_acquittable === true;
    if (template.kind === "paid" && !paid) throw Error("LOGIFA_NOT_FULLY_PAID");
  }
  let query = db
    .from("document_files")
    .select("*")
    .eq(kind === "quote" ? "quote_id" : "invoice_id", documentId);
  if (input.file_id) query = query.eq("id", id(input, "file_id"));
  else
    query = query.eq(
      "role",
      template?.kind === "paid" ? "paid_version" : "original",
    );
  const response = await query.maybeSingle(),
    file: unknown = response.data;
  if (response.error || !isRecord(file) || typeof file.id !== "string")
    throw new Error("MAIL_ARCHIVED_PDF_REQUIRED");
  if (!["original", "signed", "paid_version"].includes(String(file.role)))
    throw new Error("MAIL_FILE_ROLE");
  if (template?.kind === "paid" && file.role !== "paid_version")
    throw Error("MAIL_PAID_PDF_REQUIRED");
  const to = email(field(input, "to")),
    suppliedSubject = field(input, "subject", Boolean(template)),
    suppliedBody = field(input, "body", Boolean(template));
  const snapshot = isRecord(record.issuer_snapshot)
      ? record.issuer_snapshot
      : {},
    company = isRecord(snapshot.profile) ? snapshot.profile : snapshot,
    client = isRecord(record.client_snapshot) ? record.client_snapshot : {};
  const text = (obj: Record<string, unknown>, key: string) =>
    typeof obj[key] === "string" ? obj[key] : "";
  const context: TemplateContext = {
    "company.name": text(company, "commercial_name"),
    "company.email": text(company, "email"),
    "company.phone": text(company, "phone"),
    "company.address": text(company, "address"),
    "client.name": text(client, "company_name"),
    "client.email": text(client, "contact_email"),
    "document.number": text(
      record,
      kind === "quote" ? "quote_number" : "invoice_number",
    ),
    "document.date": text(record, "issue_date").slice(0, 10),
    "document.total": Number(record.total_gross ?? 0).toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
    }),
    "document.due": text(record, "due_date").slice(0, 10),
    "document.remaining": remaining,
  };
  const rendered = template
    ? renderEmail(
        template.design,
        context,
        input.use_template_content === true
          ? undefined
          : { subject: suppliedSubject, body: suppliedBody },
      )
    : null;
  const subject = rendered?.subject ?? suppliedSubject,
    body = rendered?.body ?? suppliedBody;
  if (subject.length > 200 || /[\r\n]/.test(subject) || body.length > 10000)
    throw new Error("MAIL_MESSAGE_INVALID");
  const finalBody =
    rendered?.text ??
    body +
      (typeof account.signature === "string" && account.signature
        ? `\n\n${account.signature}`
        : "");
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        issuer,
        kind,
        documentId,
        file: file.id,
        sha: file.sha256,
        to,
        subject,
        body: finalBody,
        version: account.key_version,
        ...(template
          ? {
              template_id: template.id,
              template_revision: template.revision,
              html: rendered?.html,
            }
          : {}),
      }),
    )
    .digest("hex");
  return {
    kind,
    documentId,
    account,
    file,
    hash,
    to,
    subject,
    body: finalBody,
    editableBody: body,
    html: rendered?.html,
    template,
  };
}
export async function previewMail(
  issuer: string,
  input: Record<string, unknown>,
) {
  const data = await message(issuer, input);
  return {
    from_email: data.account.from_email,
    sender_name: data.account.sender_name,
    reply_to: data.account.reply_to,
    to: data.to,
    subject: data.subject,
    body: data.body,
    editable_body: data.editableBody,
    ...(data.template
      ? {
          html: data.html,
          template_id: data.template.id,
          template_revision: data.template.revision,
        }
      : {}),
    filename: data.file.original_filename,
    file_id: data.file.id,
    sha256: data.file.sha256,
    preview_token: signPreview(data.hash, activeKey()),
    ready: data.account.domain_status === "verified" && sendingEnabled(),
    regulatory_transmission: false,
  };
}
export async function sendMail(issuer: string, input: Record<string, unknown>) {
  await requireAdmin();
  if (!sendingEnabled()) throw new Error("MAIL_SENDING_DISABLED");
  if (input.confirmed !== true) throw new Error("HUMAN_CONFIRMATION_REQUIRED");
  const data = await message(issuer, input);
  checkPreview(field(input, "preview_token"), data.hash, activeKey());
  const bytes = await verifiedPdf(String(data.file.id)); // Recheck refunded paid variants before dispatch.
  const { data: account, provider } = await credentials(issuer);
  if (account.key_version !== data.account.key_version)
    throw new Error("MAIL_CONFIG_CHANGED");
  const key = id(input, "key"),
    claim = await rpc("claim", issuer, {
      kind: data.kind,
      document_id: data.documentId,
      file_id: data.file.id,
      key,
      request_hash: data.hash,
      key_version: account.key_version,
      recipient: data.to,
      subject: data.subject,
      ...(data.template
        ? {
            template_id: data.template.id,
            template_revision: data.template.revision,
            final_message: {
              subject: data.subject,
              text: data.body,
              html: data.html,
            },
          }
        : {}),
    });
  if (claim.claimed !== true)
    return {
      id: claim.id,
      state: claim.state,
      already_claimed: true,
      regulatory_transmission: false,
    };
  try {
    const providerId = await provider.send({
      from: field(account, "from_email"),
      senderName: field(account, "sender_name"),
      replyTo: field(account, "reply_to"),
      to: data.to,
      subject: data.subject,
      body: data.body,
      html: data.html,
      filename: String(data.file.original_filename),
      bytes,
      key: `${issuer}/${key}`,
    });
    return {
      ...(await rpc("finish", issuer, {
        id: claim.id,
        claim_token: claim.claim_token,
        state: "sent",
        provider_id: providerId,
      })),
      regulatory_transmission: false,
    };
  } catch (error) {
    const code =
      error instanceof Error && /^MAIL_[A-Z_]+$/.test(error.message)
        ? error.message
        : "MAIL_DELIVERY_UNCERTAIN";
    await rpc("finish", issuer, {
      id: claim.id,
      claim_token: claim.claim_token,
      state: code === "MAIL_DELIVERY_UNCERTAIN" ? "unknown" : "failed",
      error_code: code,
    });
    throw new Error(code);
  }
}
