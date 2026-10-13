import { isRecord } from "../editor/contracts.ts";
import { prepareProposal, units } from "../editor/model.ts";
import type { AgentProposal, EditorDraft, Company } from "../../types/editor";
import catalog from "../../app/prestations.ts";
import {
  attributedTotal,
  unitFromTotal,
  cleanAmount,
  declaredDocumentTotal,
  displayDecimal,
} from "./pricing.ts";
import { moneyMinor, scaled, halfUp, decimal } from "../billing/money.ts";

const nullableText = { type: ["string", "null"] };
function canonicalAmount(value: unknown, field: "quantity" | "price" | "tva") {
  if (typeof value !== "string") return value;
  const suffix =
    field === "price"
      ? "(?:\\s*(?:€|euros?|EUR))?"
      : field === "tva"
        ? "(?:\\s*%)?"
        : "";
  const match = value
    .trim()
    .match(new RegExp(`^(\\d+(?:[.,]\\d+)?)${suffix}$`, "i"));
  return match ? match[1].replace(",", ".") : value;
}
function canonicalEvidence(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const pairs = [
    ["«", "»"],
    ['"', '"'],
    ["“", "”"],
  ];
  return pairs.some(
    ([start, end]) => trimmed.startsWith(start) && trimmed.endsWith(end),
  )
    ? trimmed.slice(1, -1).trim()
    : value;
}
function canonicalLine(value: unknown) {
  if (!isRecord(value)) return value;
  const line = { ...value };
  for (const key of ["quantity", "price", "tva"] as const)
    if (key in line) line[key] = canonicalAmount(line[key], key);
  for (const key of ["quantity_evidence", "price_evidence"])
    if (key in line) line[key] = canonicalEvidence(line[key]);
  for (const key of ["total_ht_evidence", "unit_evidence"])
    if (key in line) line[key] = canonicalEvidence(line[key]);
  if (typeof line.total_ht === "string")
    line.total_ht = cleanAmount(line.total_ht);
  return line;
}
export const agentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "client",
    "lines",
    "line_updates",
    "missing",
    "document_total_ht",
    "document_total_ht_evidence",
  ],
  properties: {
    document_total_ht: nullableText,
    document_total_ht_evidence: nullableText,
    client: {
      type: "object",
      additionalProperties: false,
      required: ["name", "street", "cityZip", "phone", "email", "workAddress"],
      properties: Object.fromEntries(
        ["name", "street", "cityZip", "phone", "email", "workAddress"].map(
          (key) => [key, nullableText],
        ),
      ),
    },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "unit",
          "quantity",
          "price",
          "tva",
          "quantity_evidence",
          "price_evidence",
          "total_ht",
          "total_ht_evidence",
          "unit_evidence",
        ],
        properties: {
          total_ht: {
            ...nullableText,
            description:
              "Total HT de cette prestation explicitement attribué, distinct du prix unitaire ; null pour un budget global ou ambigu.",
          },
          total_ht_evidence: {
            ...nullableText,
            description:
              "Phrase complète exacte : désignation : quantité unité pour montant euros HT. Ne jamais reformuler la preuve.",
          },
          unit_evidence: {
            ...nullableText,
            description:
              "Citation exacte justifiant l'unité de cette prestation.",
          },
          name: { type: "string" },
          unit: nullableText,
          quantity: {
            ...nullableText,
            description:
              "Nombre décimal sans unité, séparateur point ; null si inconnu.",
          },
          price: {
            ...nullableText,
            description:
              "Prix unitaire HT décimal sans devise, séparateur point ; null si inconnu.",
          },
          tva: {
            ...nullableText,
            description:
              "Taux numérique sans signe %, explicitement donné dans la consigne ; null si inconnu.",
          },
          quantity_evidence: {
            ...nullableText,
            description:
              "Sous-chaîne exacte de la consigne, sans guillemets ajoutés ; null sans preuve.",
          },
          price_evidence: {
            ...nullableText,
            description:
              "Sous-chaîne exacte de la consigne, sans guillemets ajoutés ; null sans preuve.",
          },
        },
      },
    },
    line_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "name",
          "unit",
          "quantity",
          "price",
          "tva",
          "quantity_evidence",
          "price_evidence",
          "total_ht",
          "total_ht_evidence",
          "unit_evidence",
        ],
        properties: {
          key: { type: "string" },
          total_ht: nullableText,
          total_ht_evidence: nullableText,
          unit_evidence: nullableText,
          name: nullableText,
          unit: nullableText,
          quantity: nullableText,
          price: nullableText,
          tva: nullableText,
          quantity_evidence: nullableText,
          price_evidence: nullableText,
        },
      },
    },
    missing: { type: "array", items: { type: "string" } },
  },
};
export function validatedAgentProposal(
  raw: unknown,
  prompt: string,
  draft: EditorDraft,
  companies: Company[],
) {
  if (
    !isRecord(raw) ||
    Object.keys(raw).some(
      (key) =>
        ![
          "client",
          "lines",
          "line_updates",
          "missing",
          "document_total_ht",
          "document_total_ht_evidence",
        ].includes(key),
    ) ||
    !isRecord(raw.client) ||
    !Array.isArray(raw.lines) ||
    raw.lines.length > 100 ||
    !Array.isArray(raw.missing) ||
    !raw.missing.every((v) => typeof v === "string")
  )
    throw new Error("AGENT_RESPONSE_INVALID");
  if (
    Object.keys(raw.client).some(
      (key) =>
        ![
          "name",
          "street",
          "cityZip",
          "phone",
          "email",
          "workAddress",
        ].includes(key),
    )
  )
    throw new Error("AGENT_RESPONSE_INVALID");
  const client: Partial<EditorDraft["client"]> = {},
    missing = [...raw.missing];
  for (const key of [
    "name",
    "street",
    "cityZip",
    "phone",
    "email",
    "workAddress",
  ] as const) {
    const v = raw.client[key];
    if (v === null) continue;
    if (typeof v !== "string" || v.length > 2000)
      throw new Error("AGENT_RESPONSE_INVALID");
    // A model may paraphrase a client already present in the draft or
    // hallucinate an identity. Do not apply unsupported values, but keep
    // independently valid work lines available for human review.
    if (v !== draft.client[key] && !prompt.includes(v)) {
      missing.push(`Client : champ ${key} ignoré (valeur non justifiée par la consigne).`);
      continue;
    }
    client[key] = v;
  }
  const lines: NonNullable<AgentProposal["lines"]> = [];
  const reasons: { index: number; field: string; reason: string }[] = [];
  let incomplete = 0;
  const priceSources: NonNullable<AgentProposal["priceSources"]> = [];
  const usedTotalStatements = new Set<string>();
  for (const item of raw.lines.map(canonicalLine)) {
    if (
      !isRecord(item) ||
      Object.keys(item).some(
        (key) =>
          ![
            "name",
            "unit",
            "quantity",
            "price",
            "tva",
            "quantity_evidence",
            "price_evidence",
            "total_ht",
            "total_ht_evidence",
            "unit_evidence",
          ].includes(key),
      ) ||
      typeof item.name !== "string" ||
      (item.unit !== null && typeof item.unit !== "string")
    )
      throw new Error("AGENT_RESPONSE_INVALID");
    const index = lines.length;
    const mark = (field: string, reason: string) => {
      reasons.push({ index, field, reason });
      missing.push(`Poste ${index + 1} : compléter ${field} (${reason}).`);
    };
    if (!item.name.trim() || item.name.length > 2000)
      throw new Error("AGENT_RESPONSE_INVALID");
    let name = item.name;
    const explicitName = name.replace(/^À confirmer\s*[—:-]\s*/u, "");
    if (
      explicitName !== item.name &&
      typeof item.total_ht_evidence === "string" &&
      prompt.includes(item.total_ht_evidence) &&
      item.total_ht_evidence.startsWith(explicitName) &&
      /^\s*[:—-]/u.test(item.total_ht_evidence.slice(explicitName.length))
    )
      name = explicitName;
    const values = { quantity: "", price: "", tva: "" };
    const evidence = (value: string, quote: unknown) =>
      typeof quote === "string" &&
      quote.length > 0 &&
      prompt.includes(quote) &&
      [...quote.matchAll(/\d+(?:[.,]\d+)?/g)].some(
        (match) => Number(match[0].replace(",", ".")) === Number(value),
      );
    const known = catalog.find(
      (row) =>
        row.name === name &&
        row.unit === item.unit &&
        String(row.price) === String(Number(item.price)),
    );
    const quantityEvidence = (value: string, quote: unknown) => {
      if (!evidence(value, quote) || typeof quote !== "string") return false;
      const measures = [
        ...quote.matchAll(
          /(\d+(?:[.,]\d+)?)\s*(m²|m2|m³|m3|ml|forfaits?|unités?)/giu,
        ),
      ].filter((match) => Number(match[1].replace(",", ".")) === Number(value));
      const normalized = (unit: string) =>
        unit
          .toLowerCase()
          .replace("m2", "m²")
          .replace("m3", "m³")
          .replace(/s$/, "");
      return (
        !measures.length ||
        measures.every(
          (match) =>
            typeof item.unit === "string" &&
            normalized(match[2]) === normalized(item.unit),
        )
      );
    };
    const priceEvidence = (value: string, quote: unknown) =>
      evidence(value, quote) &&
      typeof quote === "string" &&
      !/\b(?:budget|global|général|ensemble|total)\b/iu.test(quote) &&
      !(
        typeof item.total_ht_evidence === "string" &&
        item.total_ht_evidence.includes(quote) &&
        !/prix\s+unitaire|\bPU\b|€\s*\//iu.test(quote)
      );
    // Fiscal values need an explicit statement, not the catalogue's absence of VAT metadata.
    const rates = [...prompt.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((match) =>
      Number(match[1].replace(",", ".")),
    );
    for (const field of ["quantity", "price", "tva"] as const) {
      const value = item[field];
      if (value !== null && typeof value !== "string")
        throw new Error("AGENT_RESPONSE_INVALID");
      if (value === null || value === "") {
        mark(field, "UNKNOWN");
      } else if (
        !/^\d+(\.\d+)?$/.test(value) ||
        !Number.isFinite(Number(value)) ||
        (field === "quantity" && Number(value) <= 0) ||
        (field === "tva" && Number(value) > 100)
      ) {
        mark(field, "INVALID_NUMBER");
      } else if (
        field === "tva"
          ? !rates.includes(Number(value))
          : field === "quantity"
            ? !quantityEvidence(value, item.quantity_evidence)
            : !known && !priceEvidence(value, item.price_evidence)
      ) {
        mark(field, "UNSUPPORTED_VALUE");
      } else values[field] = value;
    }
    const unit =
      typeof item.unit === "string" && units.includes(item.unit)
        ? item.unit
        : "";
    if (!unit) mark("unit", "UNKNOWN_OR_INVALID");
    if (item.total_ht !== undefined && item.total_ht !== null) {
      try {
        if (
          typeof item.total_ht !== "string" ||
          (typeof item.total_ht_evidence === "string" &&
            usedTotalStatements.has(item.total_ht_evidence)) ||
          !values.quantity ||
          !unit ||
          !attributedTotal(
            prompt,
            name,
            values.quantity,
            unit,
            item.total_ht,
            item.total_ht_evidence,
            item.unit_evidence,
          )
        ) {
          mark("price", "TOTAL_NOT_ATTRIBUTED");
        } else {
          if (typeof item.total_ht_evidence === "string")
            usedTotalStatements.add(item.total_ht_evidence);
          const calculated = unitFromTotal(item.total_ht, values.quantity);
          const source = `Prix calculé : ${displayDecimal(calculated.total)} € ÷ ${displayDecimal(values.quantity)} ${unit} = ${displayDecimal(calculated.price)} €/${unit} HT`;
          if (
            !calculated.exact ||
            (values.price &&
              moneyMinor(values.price) !== moneyMinor(calculated.price))
          ) {
            values.price = "";
            mark("price", "ROUNDING_OR_PRICE_CONFLICT");
            priceSources.push({
              lineIndex: index,
              text: `${source}. À valider : total reconstitué ${calculated.rebuilt} € au lieu de ${calculated.total} € ; écart ${calculated.deltaMinor} centime(s). Prix laissé vide.`,
            });
          } else {
            values.price = calculated.price;
            for (let i = reasons.length - 1; i >= 0; i--)
              if (reasons[i].index === index && reasons[i].field === "price")
                reasons.splice(i, 1);
            for (let i = missing.length - 1; i >= 0; i--)
              if (
                missing[i].startsWith(`Poste ${index + 1} : compléter price (`)
              )
                missing.splice(i, 1);
            priceSources.push({ lineIndex: index, text: source });
          }
        }
      } catch {
        mark("price", "INVALID_TOTAL_OR_PRECISION");
      }
    }
    // Re-running an assistant proposal must not append an identical work item.
    // Compare all editable business fields; never merge distinct quantities or prices.
    const sameLine = (line: { type: string; name: string; unit: string; quantity: string; price: string; tva: string }) =>
      line.type === "normal" &&
      line.name.trim().toLocaleLowerCase("fr") === name.trim().toLocaleLowerCase("fr") &&
      line.unit === unit &&
      line.quantity === values.quantity &&
      line.price === values.price &&
      line.tva === values.tva;
    if (
      draft.lines.some(sameLine) ||
      lines.some(sameLine)
    ) {
      missing.push(`Prestation déjà présente, non ajoutée à nouveau : ${name}.`);
      continue;
    }
    if (!unit || Object.values(values).some((value) => value === ""))
      incomplete++;
    lines.push({
      type: "normal",
      name,
      unit,
      ...values,
    });
  }
  const lineUpdates: NonNullable<AgentProposal["lineUpdates"]> = [];
  const updates = raw.line_updates ?? [];
  if (!Array.isArray(updates) || updates.length > 100)
    throw new Error("AGENT_RESPONSE_INVALID");
  const seen = new Set<string>();
  for (const update of updates.map(canonicalLine)) {
    if (
      !isRecord(update) ||
      typeof update.key !== "string" ||
      seen.has(update.key) ||
      Object.keys(update).some(
        (key) =>
          ![
            "key",
            "name",
            "unit",
            "quantity",
            "price",
            "tva",
            "quantity_evidence",
            "price_evidence",
            "total_ht",
            "total_ht_evidence",
            "unit_evidence",
          ].includes(key),
      )
    )
      throw new Error("AGENT_RESPONSE_INVALID");
    seen.add(update.key);
    const line = draft.lines.find((row) => row.key === update.key);
    if (!line || line.type !== "normal")
      throw new Error("AGENT_LINE_NOT_FOUND");
    const patch: NonNullable<AgentProposal["lineUpdates"]>[number] = {
      key: line.key,
    };
    for (const key of ["name", "unit", "quantity", "price", "tva"] as const) {
      const v = update[key];
      if (v === null || v === undefined || v === line[key]) continue;
      if (typeof v !== "string" || v.length > 2000)
        throw new Error("AGENT_RESPONSE_INVALID");
      if (key === "name" || key === "unit") {
        if (!prompt.includes(v))
          throw new Error("AGENT_UNSUPPORTED_LINE_VALUE");
      } else if (key === "tva") {
        if (
          ![...prompt.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].some(
            (m) => Number(m[1].replace(",", ".")) === Number(v),
          )
        ) {
          missing.push(`Confirmer la TVA : ${line.name}`);
          continue;
        }
      } else {
        const proof = update[`${key}_evidence`];
        if (
          key === "price" &&
          typeof proof === "string" &&
          (/\b(?:budget|global|général|ensemble|total)\b/iu.test(proof) ||
            (typeof update.total_ht_evidence === "string" &&
              update.total_ht_evidence.includes(proof) &&
              !/prix\s+unitaire|\bPU\b|€\s*\//iu.test(proof)))
        ) {
          missing.push(`Justifier le prix unitaire : ${line.name}`);
          continue;
        }
        if (
          typeof proof !== "string" ||
          !proof ||
          !prompt.includes(proof) ||
          ![...proof.matchAll(/\d+(?:[.,]\d+)?/g)].some(
            (m) => Number(m[0].replace(",", ".")) === Number(v),
          )
        ) {
          missing.push(
            `Justifier ${key === "price" ? "le tarif" : "la quantité"} : ${line.name}`,
          );
          continue;
        }
      }
      patch[key] = v;
    }
    if (update.total_ht !== null && update.total_ht !== undefined) {
      try {
        const effective = { ...line, ...patch };
        if (
          typeof update.total_ht !== "string" ||
          !effective.quantity ||
          !units.includes(effective.unit) ||
          (typeof update.total_ht_evidence === "string" &&
            usedTotalStatements.has(update.total_ht_evidence)) ||
          !attributedTotal(
            prompt,
            effective.name,
            effective.quantity,
            effective.unit,
            update.total_ht,
            update.total_ht_evidence,
            update.unit_evidence,
          )
        ) {
          missing.push(`Total HT non attribuable à la ligne : ${line.name}`);
        } else {
          if (typeof update.total_ht_evidence === "string")
            usedTotalStatements.add(update.total_ht_evidence);
          const calculated = unitFromTotal(update.total_ht, effective.quantity);
          const text = `Prix calculé : ${displayDecimal(calculated.total)} € ÷ ${displayDecimal(effective.quantity)} ${effective.unit} = ${displayDecimal(calculated.price)} €/${effective.unit} HT`;
          if (
            !calculated.exact ||
            (patch.price !== undefined &&
              moneyMinor(patch.price) !== moneyMinor(calculated.price))
          ) {
            delete patch.price;
            missing.push(
              `Valider manuellement l'arrondi ou le conflit de tarif : ${line.name}`,
            );
            priceSources.push({
              lineKey: line.key,
              text: `${text}. Écart ${calculated.deltaMinor} centime(s). Tarif existant conservé ; validation manuelle requise.`,
            });
          } else {
            patch.price = calculated.price;
            priceSources.push({ lineKey: line.key, text });
          }
        }
      } catch {
        missing.push(
          `Total HT invalide ou précision non prise en charge : ${line.name}`,
        );
      }
    }
    if (Object.keys(patch).length > 1) lineUpdates.push(patch);
  }
  const proposal: AgentProposal = {
    version: 1,
    kind: draft.kind,
    client,
    lines,
    lineMode: "append",
    lineUpdates,
    priceSources,
  };
  const assembled = prepareProposal(draft, proposal, companies);
  let totalsCheck:
    | { declared: string; calculated: string; matches: boolean | null }
    | undefined;
  try {
    const declared = declaredDocumentTotal(
      prompt,
      typeof raw.document_total_ht === "string"
        ? cleanAmount(raw.document_total_ht)
        : raw.document_total_ht,
      canonicalEvidence(raw.document_total_ht_evidence),
    );
    if (declared !== undefined) {
      const complete =
        assembled.next.lines.some((line) => line.type === "normal") &&
        assembled.next.lines.every(
          (line) => line.type !== "normal" || (line.quantity && line.price),
        );
      const calculated = assembled.next.lines.reduce(
        (sum, line) =>
          line.type === "normal" && line.quantity && line.price
            ? sum +
              halfUp(
                moneyMinor(line.price) * scaled(line.quantity, 6),
                1000000n,
              )
            : sum,
        0n,
      );
      totalsCheck = {
        declared: decimal(declared),
        calculated: decimal(calculated),
        matches: complete ? calculated === declared : null,
      };
      if (totalsCheck.matches !== true)
        missing.push(
          "Total HT du devis à confirmer : lignes incomplètes ou écart avec le total fourni.",
        );
    }
  } catch {
    missing.push("Total HT fourni invalide ou non vérifiable.");
  }
  return {
    proposal,
    missing: missing.slice(0, 100),
    totalsCheck,
    diagnostics: {
      received: raw.lines.length,
      accepted: lines.length,
      rejected: raw.lines.length - lines.length,
      incomplete,
      reasons,
    },
  };
}
