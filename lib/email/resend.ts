import { isRecord } from "../editor/contracts.ts";
export interface MailMessage {
  from: string;
  senderName: string;
  replyTo: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  filename: string;
  bytes: Uint8Array;
  key: string;
}
export function email(value: string): string {
  if (
    value.length > 254 ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(
      value,
    )
  )
    throw new Error("MAIL_EMAIL_INVALID");
  return value;
}
export function domainFor(address: string): string {
  return email(address).split("@")[1].toLowerCase();
}
export class ResendAccount {
  private readonly apiKey: string;
  private readonly request: typeof fetch;
  constructor(apiKey: string, request: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.request = request;
  }
  async verifiedDomain(domain: string): Promise<boolean> {
    let after = "";
    for (let page = 0; page < 20; page++) {
      const response = await this.request(
        `https://api.resend.com/domains?limit=100${after ? "&after=" + encodeURIComponent(after) : ""}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error("MAIL_DOMAIN_VERIFICATION_FAILED");
      const raw: unknown = await response.json();
      if (
        !isRecord(raw) ||
        !Array.isArray(raw.data) ||
        !raw.data.every(isRecord)
      )
        throw new Error("MAIL_PROVIDER_RESPONSE_INVALID");
      const found = raw.data.find((item) => item.name === domain);
      if (found) return found.status === "verified";
      if (raw.has_more !== true) return false;
      const last = raw.data.at(-1);
      if (!last || typeof last.id !== "string")
        throw new Error("MAIL_PROVIDER_RESPONSE_INVALID");
      after = last.id;
    }
    throw new Error("MAIL_DOMAIN_PAGINATION_LIMIT");
  }
  async send(message: MailMessage): Promise<string> {
    if (!message.senderName || /[<>\r\n]/.test(message.senderName))
      throw new Error("MAIL_SENDER_IDENTITY_INVALID");
    // Verify in the selected account immediately before sending; SQL flags alone never authorize a domain.
    if (!(await this.verifiedDomain(domainFor(message.from))))
      throw new Error("MAIL_DOMAIN_NOT_VERIFIED");
    let response: Response;
    try {
      response = await this.request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.key,
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          from: `${message.senderName} <${email(message.from)}>`,
          reply_to: email(message.replyTo),
          to: [email(message.to)],
          subject: message.subject,
          text: message.body,
          ...(message.html ? { html: message.html } : {}),
          attachments: [
            {
              filename: message.filename,
              content: Buffer.from(message.bytes).toString("base64"),
            },
          ],
        }),
      });
    } catch {
      throw new Error("MAIL_DELIVERY_UNCERTAIN");
    }
    if (!response.ok)
      throw new Error(
        response.status >= 500
          ? "MAIL_DELIVERY_UNCERTAIN"
          : "MAIL_PROVIDER_REJECTED",
      );
    const raw: unknown = await response.json();
    if (!isRecord(raw) || typeof raw.id !== "string")
      throw new Error("MAIL_DELIVERY_UNCERTAIN");
    return raw.id;
  }
}
