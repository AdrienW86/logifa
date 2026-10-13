import { isRecord } from "../editor/contracts";
import { uuid } from "../billing/validation";
export function validateMaster(action: string, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (
      [
        "addresses",
        "editor_fields",
        "insurance",
        "legal_mentions",
        "address",
        "contacts",
        "reviewed",
      ].includes(key)
    )
      continue;
    if (
      typeof value !== "string" ||
      value.length > (key === "logo_path" ? 700000 : 10000) ||
      value.includes("\0")
    )
      throw new Error("INPUT_MASTER_FIELD");
    if (
      ["id", "issuer_id", "client_id", "legal_entity_id"].includes(key) &&
      value
    )
      uuid(value);
  }
  if (
    data.logo_path !== undefined &&
    data.logo_path !== "" &&
    (typeof data.logo_path !== "string" ||
      (!/^\/[a-zA-Z0-9_-]+\.png$/.test(data.logo_path) &&
        !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(data.logo_path)))
  )
    throw new Error("INPUT_PNG_LOGO");
  if (
    data.color !== undefined &&
    data.color !== "" &&
    (typeof data.color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(data.color))
  )
    throw new Error("INPUT_COLOR");
  if (action === "legal") {
    for (const key of ["legal_mentions", "address", "contacts"])
      if (data[key] !== undefined && !isRecord(data[key]))
        throw new Error("INPUT_LEGAL_OBJECT");
    if (data.insurance !== undefined && !Array.isArray(data.insurance))
      throw new Error("INPUT_INSURANCE");
    if (data.reviewed !== undefined && typeof data.reviewed !== "boolean")
      throw new Error("INPUT_REVIEWED");
  }
  if (action === "client") {
    if (
      data.addresses !== undefined &&
      (!Array.isArray(data.addresses) ||
        data.addresses.length > 20 ||
        !data.addresses.every((v) => typeof v === "string" || isRecord(v)))
    )
      throw new Error("INPUT_ADDRESSES");
    const fields = data.editor_fields;
    if (
      fields !== undefined &&
      (!isRecord(fields) ||
        !["name", "street", "cityZip", "phone", "email", "workAddress"].every(
          (key) => typeof fields[key] === "string",
        ))
    )
      throw new Error("INPUT_CLIENT_FIELDS");
  }
}
