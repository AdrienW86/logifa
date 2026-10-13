import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { isRecord } from "../editor/contracts.ts";
export type SealedKey = { v: 1; nonce: string; tag: string; data: string };
const derived = (key: Buffer, purpose: string) =>
  createHmac("sha256", key).update(`logifa:mail:${purpose}:v1`).digest();
export function masterKey(value: string | undefined): Buffer {
  if (!value || !/^[a-zA-Z0-9+/]{43}=$/.test(value))
    throw new Error("MAIL_ENCRYPTION_CONFIGURATION_REQUIRED");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32)
    throw new Error("MAIL_ENCRYPTION_CONFIGURATION_REQUIRED");
  return key;
}
export function sealKey(
  secret: string,
  issuer: string,
  key: Buffer,
): SealedKey {
  if (!/^re_[a-zA-Z0-9_-]{8,200}$/.test(secret))
    throw new Error("MAIL_API_KEY_INVALID");
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", derived(key, "encryption"), nonce);
  cipher.setAAD(Buffer.from(`logifa:resend:${issuer}`));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    v: 1,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function unsealKey(
  raw: unknown,
  issuer: string,
  keys: Buffer[],
): string {
  if (
    !isRecord(raw) ||
    raw.v !== 1 ||
    typeof raw.nonce !== "string" ||
    typeof raw.tag !== "string" ||
    typeof raw.data !== "string"
  )
    throw new Error("MAIL_CREDENTIALS_UNREADABLE");
  for (const key of keys)
    try {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        derived(key, "encryption"),
        Buffer.from(raw.nonce, "base64"),
      );
      cipher.setAAD(Buffer.from(`logifa:resend:${issuer}`));
      cipher.setAuthTag(Buffer.from(raw.tag, "base64"));
      return Buffer.concat([
        cipher.update(Buffer.from(raw.data, "base64")),
        cipher.final(),
      ]).toString("utf8");
    } catch {
      /* Try only the explicitly configured previous encryption key. */
    }
  throw new Error("MAIL_CREDENTIALS_UNREADABLE");
}
export function signPreview(
  hash: string,
  key: Buffer,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ hash, expires: now + 900000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", derived(key, "preview")).update(payload).digest("base64url")}`;
}
export function checkPreview(
  token: string,
  hash: string,
  key: Buffer,
  now = Date.now(),
) {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra) throw new Error("MAIL_PREVIEW_REQUIRED");
  const expected = createHmac("sha256", derived(key, "preview"))
      .update(payload)
      .digest(),
    actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("MAIL_PREVIEW_REQUIRED");
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw new Error("MAIL_PREVIEW_REQUIRED");
  }
  if (
    !isRecord(raw) ||
    raw.hash !== hash ||
    typeof raw.expires !== "number" ||
    raw.expires <= now
  )
    throw new Error("MAIL_PREVIEW_EXPIRED_OR_CHANGED");
}
