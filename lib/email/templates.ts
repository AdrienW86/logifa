import { isRecord } from "../editor/contracts.ts";
export const templateKinds = [
  "quote",
  "invoice",
  "deposit",
  "paid",
  "reminder",
] as const;
export type TemplateKind = (typeof templateKinds)[number];
export const variables = [
  "company.name",
  "company.email",
  "company.phone",
  "company.address",
  "client.name",
  "client.email",
  "document.number",
  "document.date",
  "document.total",
  "document.due",
  "document.remaining",
] as const;
export type TemplateVariable = (typeof variables)[number];
export type TemplateContext = Record<TemplateVariable, string>;
export interface EmailDesign {
  subject: string;
  body: string;
  signature: string;
  footer: string;
  logo: string;
  color: string;
  background: string;
  font: "sans" | "serif" | "verdana";
  linkLabel: string;
  linkUrl: string;
}
export interface EmailTemplate {
  id: string;
  issuer_id: string;
  name: string;
  kind: TemplateKind;
  revision: number;
  archived: boolean;
  is_default: boolean;
  design: EmailDesign;
}
export function safeLink(raw: string) {
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Error("MAIL_TEMPLATE_LINK_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /[\s<>"']/u.test(raw)
  )
    throw Error("MAIL_TEMPLATE_LINK_INVALID");
  return url.href;
}
function content(raw: unknown, max: number) {
  if (typeof raw !== "string" || raw.length > max || /\u0000/.test(raw))
    throw Error("MAIL_TEMPLATE_CONTENT_INVALID");
  for (const token of raw.match(/\{\{[^}]*\}\}/g) ?? [])
    if (!variables.some((v) => token === `{{${v}}}`))
      throw Error("MAIL_TEMPLATE_VARIABLE_INVALID");
  const remainder = raw.replace(/\{\{[^}]*\}\}/g, "");
  if (remainder.includes("{{") || remainder.includes("}}"))
    throw Error("MAIL_TEMPLATE_VARIABLE_INVALID");
  return raw;
}
export function parseDesign(raw: unknown): EmailDesign {
  if (!isRecord(raw)) throw Error("MAIL_TEMPLATE_DESIGN_REQUIRED");
  const allowed = [
    "subject",
    "body",
    "signature",
    "footer",
    "logo",
    "color",
    "background",
    "font",
    "linkLabel",
    "linkUrl",
  ];
  if (Object.keys(raw).some((k) => !allowed.includes(k)))
    throw Error("MAIL_TEMPLATE_FIELD_INVALID");
  const subject = content(raw.subject, 200),
    body = content(raw.body, 10000);
  if (!subject.trim() || !body.trim() || /[\r\n]/.test(subject))
    throw Error("MAIL_TEMPLATE_CONTENT_INVALID");
  const font = raw.font;
  if (font !== "sans" && font !== "serif" && font !== "verdana")
    throw Error("MAIL_TEMPLATE_FONT_INVALID");
  const color = content(raw.color, 7),
    background = content(raw.background, 7);
  if (!/^#[a-f0-9]{6}$/i.test(color) || !/^#[a-f0-9]{6}$/i.test(background))
    throw Error("MAIL_TEMPLATE_COLOR_INVALID");
  const linkUrl = safeLink(content(raw.linkUrl, 2000)),
    linkLabel = content(raw.linkLabel, 120);
  if (Boolean(linkUrl) !== Boolean(linkLabel))
    throw Error("MAIL_TEMPLATE_LINK_INVALID");
  return {
    subject,
    body,
    font,
    color,
    background,
    signature: content(raw.signature, 2000),
    footer: content(raw.footer, 2000),
    logo: safeLink(content(raw.logo, 2000)),
    linkLabel,
    linkUrl,
  };
}
export function parseTemplate(raw: unknown): EmailTemplate {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.issuer_id !== "string" ||
    typeof raw.name !== "string" ||
    raw.name.length > 100 ||
    !templateKinds.some((k) => k === raw.kind) ||
    typeof raw.revision !== "number" ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1 ||
    typeof raw.archived !== "boolean" ||
    typeof raw.is_default !== "boolean"
  )
    throw Error("MAIL_TEMPLATE_RESPONSE_INVALID");
  const kind = templateKinds.find((k) => k === raw.kind);
  if (!kind) throw Error("MAIL_TEMPLATE_KIND_INVALID");
  return {
    id: raw.id,
    issuer_id: raw.issuer_id,
    name: raw.name,
    kind,
    revision: raw.revision,
    archived: raw.archived,
    is_default: raw.is_default,
    design: parseDesign(raw.design),
  };
}
export function expand(text: string, context: TemplateContext) {
  return text.replace(/\{\{([a-z.]+)\}\}/g, (_, key: string) => {
    const variable = variables.find((v) => v === key);
    if (!variable || typeof context[variable] !== "string")
      throw Error("MAIL_TEMPLATE_VARIABLE_INVALID");
    return context[variable];
  });
}
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
export function renderEmail(
  raw: EmailDesign,
  context: TemplateContext,
  edits?: { subject: string; body: string },
) {
  const design = parseDesign(raw);
  const subject = edits?.subject ?? expand(design.subject, context),
    body = edits?.body ?? expand(design.body, context);
  if (
    !subject.trim() ||
    subject.length > 200 ||
    /[\r\n]/.test(subject) ||
    !body.trim() ||
    body.length > 10000
  )
    throw Error("MAIL_MESSAGE_INVALID");
  const signature = expand(design.signature, context),
    footer = expand(design.footer, context),
    label = expand(design.linkLabel, context);
  const paragraph = (text: string) =>
    escapeHtml(text).replace(/\r?\n/g, "<br>");
  const font = {
    sans: "Arial,Helvetica,sans-serif",
    serif: "Georgia,serif",
    verdana: "Verdana,Arial,sans-serif",
  }[design.font];
  const text = [
    body,
    signature,
    design.linkUrl ? `${label}: ${design.linkUrl}` : "",
    footer,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${design.background};font-family:${font};color:#20302a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:6px solid ${design.color}"><tr><td style="padding:28px;font-family:${font}">${design.logo ? `<img src="${escapeHtml(design.logo)}" alt="${escapeHtml(context["company.name"])}" width="120" style="max-width:120px;height:auto"><br>` : ""}<h1 style="font-size:22px;color:${design.color}">${escapeHtml(context["company.name"])}</h1><div style="font-size:16px;line-height:1.6">${paragraph(body)}</div>${signature ? `<p style="font-size:15px;line-height:1.6">${paragraph(signature)}</p>` : ""}${design.linkUrl ? `<p><a href="${escapeHtml(design.linkUrl)}" target="_blank" rel="noopener noreferrer" style="color:${design.color}">${escapeHtml(label)}</a></p>` : ""}${footer ? `<hr><p style="font-size:12px;line-height:1.5;color:#52665a">${paragraph(footer)}</p>` : ""}</td></tr></table></td></tr></table></body></html>`;
  return { subject, body, text, html };
}
export const fictitiousContext: TemplateContext = {
  "company.name": "Entreprise de démonstration (fictive)",
  "company.email": "contact@example.test",
  "company.phone": "Téléphone fictif",
  "company.address": "Adresse fictive",
  "client.name": "Client de démonstration (fictif)",
  "client.email": "client@example.test",
  "document.number": "DEMO-001",
  "document.date": "13/10/2026",
  "document.total": "1 200,00 €",
  "document.due": "13/11/2026",
  "document.remaining": "600,00 €",
};
export function initialDesign(kind: TemplateKind): EmailDesign {
  const titles = {
    quote: "Votre devis",
    invoice: "Votre facture",
    deposit: "Votre facture d’acompte",
    paid: "Votre facture acquittée",
    reminder: "Rappel de paiement",
  };
  return {
    subject: titles[kind] + " {{document.number}}",
    body: `Bonjour {{client.name}},\n\n${kind === "reminder" ? "Nous vous invitons à vérifier le règlement du document joint. Solde : {{document.remaining}}." : "Vous trouverez votre document {{document.number}} en pièce jointe. Montant : {{document.total}}."}\n\nNous restons disponibles pour toute question.`,
    signature: "Cordialement,\n{{company.name}}\n{{company.email}}",
    footer:
      "{{company.address}}\nCet e-mail ne constitue pas une transmission réglementaire.",
    logo: "",
    color: "#173d32",
    background: "#f1f6f2",
    font: "sans",
    linkLabel: "",
    linkUrl: "",
  };
}
