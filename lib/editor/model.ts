import { isDraftShape, isProposalShape } from "./contracts.ts";
import type {
  DocumentKind,
  ClientFields,
  Company,
  Line,
  PdfPayload,
  PaymentNote,
  EditorDraft,
  AgentProposal,
} from "../../types/editor";
export type {
  DocumentKind,
  ClientFields,
  Company,
  Line,
  PaymentNote,
  EditorDraft,
  AgentProposal,
} from "../../types/editor";
export const clientFields = [
  "name",
  "street",
  "cityZip",
  "phone",
  "email",
  "workAddress",
] as const;
export const units = ["m²", "ml", "unité", "forfait", "m³"];
export const companyKey = (index: number) => `local-issuer-${index}`;
export const newLine = (type: "normal" | "title" = "normal"): Line => ({
  key: crypto.randomUUID(),
  type,
  name: "",
  quantity: type === "title" ? "" : "1",
  unit: "unité",
  price: "",
  tva: "0",
});
export function initialDraft(kind: DocumentKind): EditorDraft {
  const now = new Date(),
    date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    version: 1,
    kind,
    companyKey: companyKey(0),
    client: {
      name: "",
      street: "",
      cityZip: "",
      phone: "",
      email: "",
      workAddress: "",
    },
    lines: [],
    reference:
      kind === "facture"
        ? "BROUILLON"
        : `D-${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}-${Date.now().toString().slice(-4)}`,
    date,
    showAcompte: false,
    acompte: "0",
    isPaid: false,
    paymentDate: "",
    paymentMethod: "",
    customInvoiceNumber: "",
    customInvoiceDate: "",
    notes: "",
    prompt: "",
    payments: [],
  };
}
const validNumber = (v: string) =>
  typeof v === "string" &&
  /^\d+(\.\d+)?$/.test(v) &&
  Number.isFinite(Number(v));
const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export function totals(lines: Line[]) {
  const normal = lines.filter((l) => l.type !== "title");
  const totalHT = normal.reduce(
    (n, l) => n + (Number(l.price) || 0) * (Number(l.quantity) || 0),
    0,
  );
  const totalTVA = normal.reduce(
    (n, l) =>
      n +
      ((Number(l.price) || 0) *
        (Number(l.quantity) || 0) *
        (Number(l.tva) || 0)) /
        100,
    0,
  );
  return { totalHT, totalTVA, totalTTC: totalHT + totalTVA };
}
export function documentErrors(d: EditorDraft, companies: Company[]): string[] {
  const errors: string[] = [];
  if (
    d.issuerScope &&
    companies[Number(d.companyKey.replace("local-issuer-", ""))]?.databaseId !==
      d.issuerScope
  )
    errors.push("Ce brouillon appartient à un autre émetteur.");
  if (
    !companies[Number(d.companyKey.replace("local-issuer-", ""))] ||
    !/^local-issuer-\d+$/.test(d.companyKey)
  )
    errors.push("Choisissez une entreprise émettrice.");
  if (!d.client.name.trim()) errors.push("Le nom du client est indispensable.");
  if (!d.reference.trim()) errors.push("Renseignez une référence de document.");
  if (!validDate(d.date)) errors.push("Renseignez une date valide.");
  if (!d.lines.some((l) => l.type === "normal"))
    errors.push("Ajoutez au moins une prestation.");
  d.lines.forEach((l, i) => {
    if (
      !l.name.trim() ||
      (l.type === "normal" &&
        (!validNumber(l.quantity) ||
          Number(l.quantity) <= 0 ||
          !validNumber(l.price) ||
          !validNumber(l.tva) ||
          Number(l.tva) > 100 ||
          typeof l.unit !== "string" ||
          !l.unit.trim()))
    )
      errors.push(
        `Poste ${i + 1} : complétez la description, la quantité, le prix et la TVA (0 à 100 %).`,
      );
  });
  if (d.showAcompte && !validNumber(d.acompte))
    errors.push("Le montant de l’acompte doit être positif ou nul.");
  if (d.isPaid)
    errors.push(
      "La version acquittée exige des encaissements vérifiés côté serveur. Elle est indisponible en mode local.",
    );
  if (Object.values(totals(d.lines)).some((v) => !Number.isFinite(v)))
    errors.push("Les montants dépassent la capacité de calcul du document.");
  return errors;
}
export function pdfPayload(d: EditorDraft, companies: Company[]): PdfPayload {
  const errors = documentErrors(d, companies);
  if (errors.length) throw new Error(errors.join("\n"));
  const [year, month, day] = d.date.split("-");
  return {
    client: { ...d.client },
    prestations: d.lines.map((l) =>
      l.type === "title"
        ? { name: l.name, type: "title" as const }
        : {
            name: l.name,
            type: "normal" as const,
            quantity: Number(l.quantity),
            unit: l.unit,
            price: Number(l.price),
            tva: Number(l.tva),
          },
    ),
    selectedCompany:
      companies[Number(d.companyKey.replace("local-issuer-", ""))],
    invoiceNumber: d.reference,
    formattedDate: `${day}-${month}-${year}`,
    ...totals(d.lines),
    showAcompte: d.showAcompte,
    acompte: Number(d.acompte) || 0,
    resteAPayer: totals(d.lines).totalTTC - (Number(d.acompte) || 0),
    isPaid: d.isPaid,
    paymentDate: d.paymentDate,
    paymentMethod: d.paymentMethod,
    customInvoiceNumber: d.customInvoiceNumber,
    customInvoiceDate: d.customInvoiceDate,
  };
}
export type ProposedChange = { field: string; before: string; after: string };
export function prepareProposal(
  current: EditorDraft,
  raw: unknown,
  companies: Company[],
): { next: EditorDraft; changes: ProposedChange[]; base: string } {
  if (!isProposalShape(raw))
    throw new Error("Proposition structurée invalide.");
  const p = raw;
  if (
    Object.keys(p).some(
      (k) =>
        ![
          "version",
          "kind",
          "client",
          "companyKey",
          "lines",
          "lineMode",
          "lineUpdates",
          "reference",
          "date",
          "notes",
          "acompte",
          "showAcompte",
          "priceSources",
        ].includes(k),
    ) ||
    p.version !== 1 ||
    p.kind !== current.kind
  )
    throw new Error(
      "Champs proposés non autorisés ou type de document incorrect.",
    );
  const next: EditorDraft = structuredClone(current),
    changes: ProposedChange[] = [];
  if (p.priceSources !== undefined) {
    if (!Array.isArray(p.priceSources) || p.priceSources.length > 100)
      throw new Error("Provenance invalide.");
    for (const source of p.priceSources) {
      if (
        !source ||
        typeof source !== "object" ||
        (source.lineKey !== undefined
          ? typeof source.lineKey !== "string" ||
            !current.lines.some((line) => line.key === source.lineKey)
          : typeof source.lineIndex !== "number" ||
            !Number.isInteger(source.lineIndex) ||
            source.lineIndex < 0 ||
            source.lineIndex >= (p.lines?.length ?? 0)) ||
        typeof source.text !== "string" ||
        source.text.length > 2000
      )
        throw new Error("Provenance invalide.");
      changes.push({
        field: source.lineKey
          ? `Provenance du tarif — ${current.lines.find((line) => line.key === source.lineKey)?.name}`
          : `Provenance du tarif — poste ${(source.lineIndex ?? 0) + 1}`,
        before: "",
        after: source.text,
      });
    }
  }
  const change = (field: string, before: unknown, after: unknown) => {
    if (before !== after)
      changes.push({
        field,
        before: String(before ?? ""),
        after: String(after ?? ""),
      });
  };
  if (p.acompte !== undefined || p.showAcompte !== undefined) {
    if (
      current.kind !== "facture" ||
      (p.acompte !== undefined && !validNumber(p.acompte)) ||
      (p.showAcompte !== undefined && typeof p.showAcompte !== "boolean")
    )
      throw new Error(
        "Acompte déclaré invalide. Aucun encaissement ne peut être confirmé par une proposition.",
      );
    if (p.acompte !== undefined) {
      change("acompte", next.acompte, p.acompte);
      next.acompte = p.acompte;
    }
    if (p.showAcompte !== undefined) {
      change("showAcompte", next.showAcompte, p.showAcompte);
      next.showAcompte = p.showAcompte;
    }
  }
  if (p.client !== undefined) {
    if (
      !p.client ||
      typeof p.client !== "object" ||
      Array.isArray(p.client) ||
      Object.keys(p.client).some(
        (k) => !clientFields.some((field) => field === k),
      )
    )
      throw new Error("Champs client non autorisés.");
    for (const field of clientFields) {
      const v = p.client[field];
      if (v !== undefined) {
        if (typeof v !== "string" || v.length > 2000)
          throw new Error("Valeur client invalide.");
        change(`client.${field}`, next.client[field], v);
        next.client[field] = v;
      }
    }
  }
  for (const field of ["companyKey", "reference", "date", "notes"] as const)
    if (p[field] !== undefined) {
      const v = p[field]!;
      if (typeof v !== "string" || v.length > 10000)
        throw new Error("Valeur proposée invalide.");
      change(field, next[field], v);
      next[field] = v;
    }
  if (
    p.companyKey !== undefined &&
    (!/^local-issuer-\d+$/.test(p.companyKey) ||
      !companies[Number(p.companyKey.replace("local-issuer-", ""))])
  )
    throw new Error("Entreprise inconnue.");
  if (p.date !== undefined && !validDate(p.date))
    throw new Error("Date proposée invalide.");
  if (p.lineMode !== undefined && !["append", "replace"].includes(p.lineMode))
    throw new Error("Mode de lignes invalide.");
  if (p.lineUpdates !== undefined) {
    if (
      !Array.isArray(p.lineUpdates) ||
      p.lineUpdates.length > 100 ||
      p.lineMode === "replace"
    )
      throw new Error("Modifications de lignes invalides.");
    const seen = new Set<string>();
    for (const patch of p.lineUpdates) {
      if (
        !patch ||
        typeof patch.key !== "string" ||
        seen.has(patch.key) ||
        Object.keys(patch).some(
          (key) =>
            !["key", "name", "unit", "quantity", "price", "tva"].includes(key),
        )
      )
        throw new Error("Modification de ligne invalide.");
      seen.add(patch.key);
      const line = next.lines.find((row) => row.key === patch.key);
      if (!line || line.type !== "normal")
        throw new Error("Ligne à modifier inconnue.");
      const after = { ...line, ...patch };
      if (
        typeof after.name !== "string" ||
        !after.name.trim() ||
        (after.unit !== "" && !units.includes(after.unit)) ||
        (after.quantity !== "" &&
          (!validNumber(after.quantity) || Number(after.quantity) <= 0)) ||
        (after.price !== "" && !validNumber(after.price)) ||
        (after.tva !== "" &&
          (!validNumber(after.tva) || Number(after.tva) > 100))
      )
        throw new Error("Valeurs de ligne invalides.");
      for (const key of ["name", "unit", "quantity", "price", "tva"] as const) {
        change(`ligne.${line.key}.${key}`, line[key], after[key]);
        line[key] = after[key];
      }
    }
  }
  if (p.lines !== undefined) {
    if (!Array.isArray(p.lines) || p.lines.length > 1000)
      throw new Error("Liste proposée invalide.");
    const lines = p.lines.map((l) => {
      if (
        !l ||
        !["normal", "title"].includes(l.type) ||
        typeof l.name !== "string" ||
        !l.name.trim() ||
        Object.keys(l).some(
          (k) =>
            !["type", "name", "quantity", "unit", "price", "tva"].includes(k),
        )
      )
        throw new Error("Poste proposé invalide.");
      if (
        l.type === "normal" &&
        ((l.quantity !== "" &&
          (!validNumber(l.quantity) || Number(l.quantity) <= 0)) ||
          (l.price !== "" && !validNumber(l.price)) ||
          (l.tva !== "" && (!validNumber(l.tva) || Number(l.tva) > 100)) ||
          (l.unit !== "" && !units.includes(l.unit)))
      )
        throw new Error("Prix, quantité ou TVA proposés invalides.");
      return { ...newLine(l.type), ...l };
    });
    if (lines.length || p.lineMode === "replace")
      change(
        "prestations",
        `${current.lines.length} postes`,
        `${p.lineMode === "replace" ? 0 : current.lines.length} postes conservés + ${lines.length} proposés`,
      );
    for (const [index, line] of lines.entries()) {
      const labels = {
        name: "Désignation",
        unit: "Unité",
        quantity: "Quantité",
        price: "Prix unitaire HT",
        tva: "TVA (%)",
      };
      for (const field of [
        "name",
        "unit",
        "quantity",
        "price",
        "tva",
      ] as const) {
        if (line.type === "title" && field !== "name") continue;
        change(
          `Poste ajouté ${index + 1} — ${labels[field]}`,
          "",
          line[field] || "À compléter",
        );
      }
    }
    if (p.lineMode === "replace") {
      next.lines = lines;
    } else if (current.lines.some((line) => line.type === "title")) {
      // Proposals are grouped into the existing sections instead of appending
      // a second set of nearly identical headings at the end of the document.
      const sectionKey = (label: string) => {
        const normalized = label.toLocaleLowerCase("fr").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
        const groups = [
          ["installation", "securisation", "echafaudage"],
          ["depose", "demontage"],
          ["preparation", "supports"],
          ["couverture", "tuiles"],
          ["faitage", "aretiers"],
          ["zinguerie", "solins", "etancheite"],
          ["evacuation", "nettoyage", "repli"],
        ];
        return groups.findIndex((words) => words.some((word) => normalized.includes(word)));
      };
      const arranged = [...next.lines];
      let activeTitle: string | null = null;
      for (const line of lines) {
        if (line.type === "title") {
          const exact = arranged.find((item) => item.type === "title" &&
            item.name.trim().toLocaleLowerCase("fr") === line.name.trim().toLocaleLowerCase("fr"));
          const family = sectionKey(line.name);
          const matching = exact ?? (family < 0 ? undefined : arranged.find((item) =>
            item.type === "title" && sectionKey(item.name) === family));
          if (matching) {
            activeTitle = matching.key;
          } else {
            arranged.push(line);
            activeTitle = line.key;
          }
          continue;
        }
        const headingIndex = activeTitle === null ? -1 : arranged.findIndex((item) => item.key === activeTitle);
        if (headingIndex < 0) {
          arranged.push(line);
          continue;
        }
        let insertAt = headingIndex + 1;
        while (insertAt < arranged.length && arranged[insertAt].type !== "title") insertAt++;
        arranged.splice(insertAt, 0, line);
      }
      next.lines = arranged;
    } else {
      next.lines = [...next.lines, ...lines];
    }
  }
  return { next, changes, base: JSON.stringify(current) };
}
export function restoreDraft(
  raw: unknown,
  kind: DocumentKind,
  companies: Company[],
): EditorDraft {
  if (
    isDraftShape(raw) &&
    raw.issuerScope &&
    companies[Number(raw.companyKey.replace("local-issuer-", ""))]
      ?.databaseId !== raw.issuerScope
  )
    throw new Error("Import refusé : brouillon d’un autre émetteur.");
  if (!isDraftShape(raw))
    throw new Error(
      "Brouillon incompatible ou endommage. Import annule sans remplacement.",
    );
  const d = raw;
  if (
    d.kind !== kind ||
    !/^local-issuer-\d+$/.test(d.companyKey) ||
    !companies[Number(d.companyKey.replace("local-issuer-", ""))]
  )
    throw new Error("Entreprise ou type de brouillon incompatible.");
  if (
    new Set(d.lines.map((l) => l.key)).size !== d.lines.length ||
    new Set(d.payments.map((p) => p.key)).size !== d.payments.length
  )
    throw new Error(
      "Le brouillon contient des postes dupliqués. Import annulé sans remplacement de votre saisie.",
    );
  return structuredClone(d);
}
