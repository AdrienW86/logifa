"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { companies } from "../../app/company";
import catalog from "../../app/prestations";
import { generatePdf } from "../../utils/generatePdf";
import { generateFacture } from "../../utils/generateFacture";
import {
  companyKey,
  clientFields,
  initialDraft,
  newLine,
  totals,
  documentErrors,
  pdfPayload,
  prepareProposal,
  restoreDraft,
} from "../../lib/editor/model";
import type {
  DocumentKind,
  EditorDraft,
  Line,
  ClientFields,
} from "../../lib/editor/model";
import type { jsPDF as PdfDocument } from "jspdf";
import ServerDocument from "./ServerDocument";
import { api, selectedIssuer } from "../../lib/workspace/client";
import PromptComposer from "./PromptComposer";
import { isRecord } from "../../lib/editor/contracts";
import LineEditor from "./LineEditor";
import s from "./editor.module.css";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const issuers = companies;
// Ephemeral recovery after soft navigation, never a server/disk archive.
const tabRecovery = new Map<string, EditorDraft>();
const money = (v: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(v.toFixed(2)),
  );
const sections = [
  ["entreprise", "Émetteur"],
  ["client", "Client & chantier"],
  ["document", "Document"],
  ["prestations", "Prestations"],
  ["montants", "Montants & règlements"],
  ["conditions", "Conditions & notes"],
  ["apercu", "Aperçu & PDF"],
];
const labels = {
  name: "Nom / raison sociale",
  street: "Rue et numéro",
  cityZip: "Code postal et ville",
  phone: "Téléphone",
  email: "Email",
  workAddress: "Adresse du chantier",
};
const reviewNames: Record<string, string> = {
  acompte: "Acompte déclaré (non vérifié)",
  showAcompte: "Afficher l’acompte déclaré",
  companyKey: "Entreprise émettrice",
  reference: "Référence",
  date: "Date",
  notes: "Remarques internes",
  prestations: "Prestations",
  ...Object.fromEntries(
    Object.entries(labels).map(([key, label]) => [`client.${key}`, label]),
  ),
};
const reviewValue = (field: string, value: string) =>
  field === "companyKey"
    ? (issuers[Number(value.replace("local-issuer-", ""))]?.name ?? value)
    : value;
function sectionAmount(lines: Line[], index: number) {
  if (lines[index].type !== "title") return 0;
  const next = lines.findIndex((l, i) => i > index && l.type === "title");
  return totals(lines.slice(index + 1, next < 0 ? lines.length : next)).totalHT;
}
type PdfResult = { blob: Blob; name: string };
// The generators stay byte-for-byte intact. Only pdf.save is captured, using
// exactly the same document, so preview and download share the actual PDF.
export async function renderOriginalPdf(
  d: EditorDraft,
  issuers: import("../../types/editor").Company[] = companies,
): Promise<PdfResult> {
  const { default: jsPDF } = await import("jspdf");
  const api = jsPDF.API;
  const saveDescriptor = Object.getOwnPropertyDescriptor(api, "save");
  let result: PdfResult | undefined;
  const images = await Promise.all(
    issuers
      .filter((_, i) => companyKey(i) === d.companyKey)
      .map(
        (c) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () =>
              reject(new Error("Le logo ne peut pas être chargé."));
            img.src = c.logo;
          }),
      ),
  );
  void images;
  try {
    Object.defineProperty(api, "save", {
      configurable: true,
      writable: true,
      enumerable: saveDescriptor?.enumerable ?? true,
      value: function (this: PdfDocument, name: string) {
        result = { blob: this.output("blob"), name };
        return this;
      },
    });
    const payload = pdfPayload(d, issuers);
    if (d.kind === "devis") generatePdf(payload);
    else generateFacture(payload);
    if (!result) throw new Error("Le PDF n’a pas pu être préparé.");
    return result;
  } finally {
    if (saveDescriptor) Object.defineProperty(api, "save", saveDescriptor);
    else Reflect.deleteProperty(api, "save");
  }
}

export default function DocumentEditor({
  kind,
  storageScope,
}: {
  kind: DocumentKind;
  storageScope?: string;
}) {
  const [storageIssuer] = useState(() =>
    typeof window !== "undefined" && storageScope
      ? (new URLSearchParams(window.location.search).get("issuer") ??
        selectedIssuer(storageScope))
      : "",
  );
  const [historicalQuoteId] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("fromQuote") ?? "")
      : "",
  );
  const [issuers, setIssuers] = useState(companies);
  const [agentEnabled, setAgentEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    api("/api/agent")
      .then((result) => {
        if (alive) setAgentEnabled(result.enabled === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [serverLocked, setServerLocked] = useState(false);
  const [invoiceReady, setInvoiceReady] = useState(false);
  const [serverDocument, setServerDocument] = useState<{
    id:string;issuer:string;kind:"quote"|"invoice";number:string;
  } | null>(null);
  const invoiceIssueRef = useRef<(() => Promise<void>) | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(() => initialDraft(kind));
  const [status, setStatus] = useState(""),
    [errors, setErrors] = useState<string[]>([]),
    [saved, setSaved] = useState(() => JSON.stringify(draft));
  const [available, setAvailable] = useState<string | null>(null),
    [companySearch, setCompanySearch] = useState("");
  const [savedClient, setSavedClient] = useState<ClientFields | null>(null);
  const [recoveredFromTab, setRecoveredFromTab] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false),
    [catalogSearch, setCatalogSearch] = useState(""),
    [category, setCategory] = useState("Toutes");
  const [catalogQuantity, setCatalogQuantity] = useState(""),
    [undo, setUndo] = useState<{ line: Line; index: number } | null>(null);
  const [preview, setPreview] = useState<{
      url: string;
      name: string;
      base: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<ReturnType<
    typeof prepareProposal
  > | null>(null);
  useEffect(() => {
    if (!serverDocument || !serverLocked) return;
    // Remove any stale local draft preview immediately after final issuance.
    setPreview((previous) => {
      if (previous?.url.startsWith("blob:")) URL.revokeObjectURL(previous.url);
      return null;
    });
    // The official PDF remains accessible through the explicit preview action.
    setStatus("Document " + serverDocument.number +
      " émis. Cliquez sur « Afficher le PDF numéroté » pour charger la version officielle.");
  }, [serverDocument, serverLocked]);
  const draftRef = useRef(draft),
    savedRef = useRef(saved),
    busyRef = useRef(false),
    fileRef = useRef<HTMLInputElement>(null),
    lineRef = useRef<HTMLDivElement>(null);
  const storageKey = storageScope
    ? `logifa:editor:v1:${storageScope}:${storageIssuer ? storageIssuer + ":" : ""}${kind}${historicalQuoteId ? ":historical:" + historicalQuoteId : ""}`
    : null;
  const changed = JSON.stringify(draft) !== saved;
  const company =
    issuers[Number(draft.companyKey.replace("local-issuer-", ""))] ??
    issuers[0];
  // The selected issuer supplies the PDF accent; never use legacy hard-coded company colors.
  const pdfAccent = /^#[0-9a-fA-F]{6}$/.test(company?.color ?? "")
    ? company.color
    : "#295746";
  const previewSignature = JSON.stringify({
    draft,
    issuer: company?.databaseId ?? company?.name ?? "",
    pdfAccent,
  });
  const amounts = totals(draft.lines),
    remaining = amounts.totalTTC - (Number(draft.acompte) || 0);
  const ttcConfirmed =
    draft.lines.some((line) => line.type === "normal") &&
    draft.lines.every(
      (line) =>
        line.type !== "normal" ||
        (line.quantity !== "" && line.price !== "" && line.tva !== ""),
    );
  const patch = (values: Partial<EditorDraft>) => {
    if (serverLocked) return;
    setDraft((current) => ({ ...current, ...values }));
  };
  useEffect(() => {
    draftRef.current = draft;
    savedRef.current = saved;
  }, [draft, saved]);
  useEffect(() => {
    if (!storageKey) return;
    const unsaved = tabRecovery.get(storageKey);
    if (unsaved) {
      setAvailable(JSON.stringify(unsaved));
      setRecoveredFromTab(true);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setAvailable(stored);
        try {
          const prior = restoreDraft(JSON.parse(stored), kind, issuers);
          if (prior.client.name.trim()) setSavedClient(prior.client);
        } catch {
          /* Offer an explicit import error only when restoration is requested. */
        }
      }
    } catch {
      setStatus(
        "Le stockage local est indisponible. Vous pouvez exporter votre brouillon.",
      );
    }
  }, [storageKey, kind]);
  useEffect(
    () => () => {
      if (storageKey && JSON.stringify(draftRef.current) !== savedRef.current)
        tabRecovery.set(storageKey, structuredClone(draftRef.current));
    },
    [storageKey],
  );
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(draftRef.current) !== savedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    const navigation = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest("a") : null;
      if (
        target &&
        !target.getAttribute("href")?.startsWith("#") &&
        JSON.stringify(draftRef.current) !== savedRef.current &&
        !window.confirm(
          "Vous avez des modifications non sauvegardées. Quitter cet éditeur ?",
        )
      )
        e.preventDefault();
    };
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, []);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (serverLocked || catalogOpen || proposal) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveLocal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        addLine("normal");
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  useEffect(() => {
    if (!catalogOpen && !proposal) return;
    const previous =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      modal = document.querySelector<HTMLElement>(
        '[data-logifa-editor] [role="dialog"]',
      );
    const focusables = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
        ) ?? [],
      );
    (modal?.querySelector<HTMLElement>("input") ?? focusables()[0])?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCatalogOpen(false);
        setProposal(null);
      }
      if (e.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", trap);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [catalogOpen, proposal]);
  const updateLine = useCallback(
    (key: string, field: keyof Line, value: string) =>
      setDraft((d) => ({
        ...d,
        lines: d.lines.map((l) =>
          l.key === key ? { ...l, [field]: value } : l,
        ),
      })),
    [],
  );
  function addLine(type: "normal" | "title") {
    setDraft((d) => ({ ...d, lines: [...d.lines, newLine(type)] }));
    setTimeout(
      () =>
        lineRef.current
          ?.querySelector<HTMLTextAreaElement>("article:last-child textarea")
          ?.focus(),
      30,
    );
  }
  const moveLine = useCallback((index: number, by: number) => {
    setDraft((d) => {
      if (index + by < 0 || index + by >= d.lines.length) return d;
      const lines = [...d.lines];
      [lines[index], lines[index + by]] = [lines[index + by], lines[index]];
      return { ...d, lines };
    });
    setStatus("Ordre des postes mis à jour.");
  }, []);
  const duplicateLine = useCallback(
    (key: string) =>
      setDraft((d) => {
        const index = d.lines.findIndex((l) => l.key === key);
        if (index < 0) return d;
        const lines = [...d.lines];
        lines.splice(index + 1, 0, {
          ...lines[index],
          key: crypto.randomUUID(),
        });
        return { ...d, lines };
      }),
    [],
  );
  const removeLine = useCallback((key: string) => {
    const lines = draftRef.current.lines,
      index = lines.findIndex((l) => l.key === key);
    if (index < 0) return;
    setUndo({ line: lines[index], index });
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== key) }));
    setStatus("Poste supprimé. Vous pouvez annuler cette suppression.");
  }, []);
  function saveLocal() {
    if (!storageKey) {
      setStatus(
        "Votre session doit être chargée pour sauvegarder sur cet appareil.",
      );
      return;
    }
    try {
      const data = JSON.stringify(draftRef.current);
      localStorage.setItem(storageKey, data);
      tabRecovery.delete(storageKey);
      setSaved(data);
      if (draftRef.current.client.name.trim())
        setSavedClient({ ...draftRef.current.client });
      setStatus("Brouillon sauvegardé sur cet appareil uniquement.");
    } catch {
      setStatus(
        "Sauvegarde locale impossible : espace insuffisant ou stockage bloqué. Exportez le brouillon.",
      );
    }
  }
  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function restore(raw: string) {
    if (serverLocked) return;
    try {
      const next = restoreDraft(JSON.parse(raw), kind, issuers);
      if (
        changed &&
        !window.confirm(
          "Remplacer la saisie actuelle par ce brouillon ? Exportez-la d’abord si vous souhaitez la conserver.",
        )
      )
        return;
      setDraft(next);
      if (!recoveredFromTab) setSaved(JSON.stringify(next));
      setRecoveredFromTab(false);
      setAvailable(null);
      setStatus("Brouillon restauré. Il reste local et non émis.");
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }
  async function createPdf(download = false) {
    if (busyRef.current) return;
    // After issuance, never regenerate an editable local PDF from the draft:
    // the canonical server renderer uses the final fiscal number and snapshots.
    if (serverLocked) {
      if (!serverDocument || !serverDocument.number)
        { setStatus("Référence émise indisponible : rouvrez le document depuis vos factures ou devis."); return; }
      busyRef.current=true;
      setBusy(true);
      try {
        const path = `/api/${serverDocument.kind === "invoice" ? "invoices" : "quotes"}/${encodeURIComponent(serverDocument.id)}/pdf?issuer=${encodeURIComponent(serverDocument.issuer)}`;
        const response=await fetch(path,{credentials:"same-origin",cache:"no-store"});
        if(!response.ok) throw new Error("PDF serveur indisponible (code "+response.status+").");
        if (!response.headers.get("content-type")?.includes("application/pdf"))
          throw new Error("Réponse du serveur non reconnue comme PDF.");
        const blob=await response.blob();
        if(!blob.size) throw new Error("PDF vide.");
        const name=(serverDocument.kind==="invoice"?"Facture_":"Devis_")+serverDocument.number+".pdf";
        if(download) downloadBlob(blob,name);
        else setPreview({url:URL.createObjectURL(blob),name,base:previewSignature});
        setStatus(download
          ? "PDF fiscal "+serverDocument.number+" téléchargé depuis le serveur."
          : "PDF officiel "+serverDocument.number+" chargé depuis le serveur.");
      } catch(error) {setStatus("Impossible de récupérer le PDF définitif : "+errorMessage(error));}
      finally {busyRef.current=false;setBusy(false);}
      return;
    }
    const issues = documentErrors(draft, issuers);
    setErrors(issues);
    if (issues.length) {
      document
        .getElementById("editor-errors")
        ?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const pdf = await renderOriginalPdf(draft, issuers);
      if (download) downloadBlob(pdf.blob, pdf.name);
      else
        setPreview({
          url: URL.createObjectURL(pdf.blob),
          name: pdf.name,
          base: previewSignature,
        });
      setStatus(
        download
          ? "PDF téléchargé. Aucun document émis ou archivé sur serveur."
          : "Aperçu produit par le moteur PDF original.",
      );
    } catch (e) {
      setStatus(`Impossible de générer le PDF : ${errorMessage(e)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const categoryList = ["Toutes", ...new Set(catalog.map((c) => c.category))];
  const filteredCatalog = catalog.filter(
    (c) =>
      (category === "Toutes" || c.category === category) &&
      `${c.name} ${c.category}`
        .toLocaleLowerCase()
        .includes(catalogSearch.toLocaleLowerCase()),
  );
  return (
    <main className={s.workspace} data-logifa-editor
      style={{ "--green": pdfAccent } as import("react").CSSProperties}>
      <aside className={s.rail}>
        <a className={s.brand} href="/">
          L<span>LOGIFA</span>
        </a>
        <span className={s.railLabel}>ESPACE DE CRÉATION</span>
        <nav aria-label="Sections du document">
          {sections.map(([id, label], i) => (
            <a href={`#${id}`} key={id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className={s.railFoot}>
          <span className={s.dot} />
          Mode manuel complet<p>Brouillon local · accès privé</p>
        </div>
      </aside>
      <div className={s.main}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            Documents <span>/</span> Nouveau {kind}
          </div>
          <div className={s.topActions}>
            <span className={s.badge}>
              {changed ? "Modifications en cours" : "Saisie inchangée"}
            </span>
            {kind === "facture" && storageIssuer ? (
              <>
                <button type="button" disabled={!invoiceReady || serverLocked}
                  onClick={() => {
                    if (!invoiceIssueRef.current) {
                      setStatus("Connexion au dossier de facturation en cours.");
                      return;
                    }
                    void invoiceIssueRef.current();
                  }}>
                  {serverLocked ? "Facture enregistrée" : "Enregistrer et numéroter"}
                </button>
                {!serverLocked && <button type="button" onClick={saveLocal}>
                  Conserver ma saisie <kbd>⌘ / Ctrl S</kbd>
                </button>}
              </>
            ) : <button type="button" disabled={serverLocked} onClick={saveLocal}>
              Conserver ma saisie <kbd>⌘ / Ctrl S</kbd>
            </button>}
          </div>
        </header>
        <div className={s.heading}>
          <div>
            <p className={s.eyebrow}>VOTRE ATELIER DE DOCUMENTS</p>
            <h1>
              {kind === "devis" ? "Un devis précis." : "Une facture claire."}
              <br />
              <span>Un travail bien présenté.</span>
            </h1>
            <p>
              Préparez chaque détail, gardez la main, puis retrouvez votre PDF
              habituel.
            </p>
          </div>
          <div className={s.documentTag}>
            {kind === "devis" ? "DEVIS" : "FACTURE"}
            <span>{serverLocked && draft.reference && draft.reference !== "BROUILLON"
              ? "N° " + draft.reference + " · émis"
              : "En préparation · numéro attribué lors de l'émission"}</span>
          </div>
        </div>
        {available && (
          <div className={s.notice}>
            <div>
              <strong>
                {recoveredFromTab
                  ? "Une saisie non sauvegardée de cet onglet vous attend."
                  : "Un brouillon vous attend sur cet appareil."}
              </strong>
              <p>La saisie actuelle n’a pas été remplacée.</p>
            </div>
            <button type="button" onClick={() => restore(available)}>
              Examiner et restaurer
            </button>
            <button
              type="button"
              aria-label="Masquer la proposition de restauration"
              onClick={() => setAvailable(null)}
            >
              ×
            </button>
          </div>
        )}
        <ServerDocument
          draft={draft}
          userId={storageScope}
          onLoad={(next, saved) => {
            setDraft(next);
            if (saved) setSaved(JSON.stringify(next));
          }}
          onCompany={(company) => {
            setIssuers([company]);
            setDraft((current) => ({
              ...current,
              companyKey: "local-issuer-0",
              issuerScope: company.databaseId,
            }));
          }}
          onLock={setServerLocked}
          issueActionRef={invoiceIssueRef}
          onIssueAvailable={setInvoiceReady}
          onIssuedDocument={setServerDocument}
        />
        {!historicalQuoteId && (
        <PromptComposer
          kind={kind}
          agentEnabled={agentEnabled}
          onGenerate={async () => {
            if (serverLocked) throw new Error("Document emis immuable.");
            if (
              !confirm(
                "Envoyer à OpenAI votre consigne, les noms de l’entreprise et du client sélectionnés, les lignes et le catalogue de prestations ? Les coordonnées, paiements et données fiscales du formulaire ne sont pas envoyés automatiquement. La consigne est transmise telle quelle : retirez les informations sensibles inutiles. Cet appel est facturé. Vous relirez la proposition avant de l’appliquer.",
              )
            )
              return;
            const result = await api("/api/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: draft.prompt,
                draft,
                confirmed: true,
              }),
            });
            const review = prepareProposal(draft, result.proposal, issuers);
            const check = result.totalsCheck;
            if (
              isRecord(check) &&
              typeof check.declared === "string" &&
              typeof check.calculated === "string"
            )
              review.changes.push({
                field: "Contrôle du total HT",
                before: `Fourni : ${check.declared} € HT`,
                after: `Calculé : ${check.calculated} € HT — ${check.matches === true ? "concordance exacte" : "écart ou lignes incomplètes à confirmer"}`,
              });
            if (!review.changes.length)
              throw new Error(
                "Aucune modification exploitable reçue. Précisez votre demande.",
              );
            setProposal(review);
            const diagnostics = result.diagnostics;
            const summary =
              isRecord(diagnostics) &&
              typeof diagnostics.received === "number" &&
              typeof diagnostics.accepted === "number" &&
              typeof diagnostics.rejected === "number"
                ? `${diagnostics.received} postes reçus, ${diagnostics.accepted} retenus, ${diagnostics.rejected} rejetés. `
                : "";
            setStatus(
              summary +
                (Array.isArray(result.missing)
                  ? result.missing.join(" ; ")
                  : ""),
            );
          }}
          value={draft.prompt}
          onChange={(prompt) => patch({ prompt })}
          onReview={(raw) => {
            try {
              if (serverLocked) throw new Error("Document émis immuable.");
              setProposal(prepareProposal(draft, raw, issuers));
            } catch (e) {
              setStatus(errorMessage(e));
            }
          }}
        />
        )}
        <div className={s.columns}>
          <fieldset
            disabled={serverLocked}
            className={s.form}
            style={{ border: 0, minWidth: 0 }}
          >
            <section id="entreprise" className={s.section}>
              <div className={s.sectionHeading}>
                <span>01</span>
                <div>
                  <h2>Entreprise émettrice</h2>
                  <p>L’identité qui apparaîtra sur votre document.</p>
                </div>
              </div>
              <label htmlFor="company-search">Rechercher une entreprise</label>
              <input
                id="company-search"
                type="search"
                placeholder="Nom, SIRET, ville…"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
              />
              <div
                className={s.companies}
                role="group"
                aria-label="Choix de l’émetteur"
              >
                {issuers.map(
                  (c, i) =>
                    `${c.name} ${c.siret} ${c.cityZip}`
                      .toLowerCase()
                      .includes(companySearch.toLowerCase()) && (
                      <button
                        type="button"
                        key={companyKey(i)}
                        aria-pressed={draft.companyKey === companyKey(i)}
                        className={
                          draft.companyKey === companyKey(i)
                            ? s.selectedCompany
                            : ""
                        }
                        onClick={() => {
                          if (draft.companyKey === companyKey(i)) return;
                          if (
                            draft.lines.length &&
                            !window.confirm(
                              "Changer uniquement l’émetteur ? Le client et les prestations seront conservés. Aucun rattachement juridique serveur ne sera modifié.",
                            )
                          )
                            return;
                          patch({ companyKey: companyKey(i) });
                        }}
                      >
                        <img src={c.logo} alt="" />
                        <span>
                          <strong>{c.name}</strong>
                          <small>{c.cityZip}</small>
                        </span>
                        <span aria-hidden>
                          {draft.companyKey === companyKey(i) ? "✓" : "○"}
                        </span>
                      </button>
                    ),
                )}
              </div>
              <div className={s.companyColorNote} aria-label="Couleur d'accent du PDF">
                <span className={s.companyColorDot} style={{ backgroundColor: pdfAccent }} aria-hidden="true" />
                <span>Couleur du PDF : <strong>{pdfAccent.toUpperCase()}</strong>. Titres, en-têtes et tableau du document.</span>
              </div>
              <p className={s.helper}>Couleur du PDF : <strong style={{color:pdfAccent}}>{pdfAccent.toUpperCase()}</strong> ●</p>
              <p className={s.helper}>
                {company.address} · {company.cityZip}
                <br />
                SIRET {company.siret} · {company.phone}
              </p>
            </section>
            <section id="client" className={s.section}>
              <div className={s.sectionHeading}>
                <span>02</span>
                <div>
                  <h2>Client & chantier</h2>
                  <p>Une adresse de facturation, un lieu d’intervention.</p>
                </div>
              </div>
              {savedClient && (
                <div className={s.clientSuggestion}>
                  <span>Sur cet appareil : {savedClient.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        Object.values(draft.client).some(Boolean) &&
                        !window.confirm(
                          "Remplacer les informations client actuelles par celles du brouillon local ?",
                        )
                      )
                        return;
                      patch({ client: { ...savedClient } });
                    }}
                  >
                    Reprendre ce client
                  </button>
                </div>
              )}
              <div className={s.grid}>
                {clientFields.map((field) => (
                  <label
                    key={field}
                    className={field === "workAddress" ? s.wide : ""}
                  >
                    {labels[field]}
                    {field === "name" && " *"}
                    <input
                      name={field}
                      autoComplete={
                        field === "email"
                          ? "email"
                          : field === "phone"
                            ? "tel"
                            : "off"
                      }
                      type={
                        field === "email"
                          ? "email"
                          : field === "phone"
                            ? "tel"
                            : "text"
                      }
                      value={draft.client[field]}
                      onChange={(e) =>
                        patch({
                          client: { ...draft.client, [field]: e.target.value },
                        })
                      }
                      placeholder={
                        field === "workAddress"
                          ? "Si différente de l’adresse du client"
                          : ""
                      }
                    />
                  </label>
                ))}
              </div>
              <p className={s.helper}>
                Clients saisis manuellement. Aucune recherche en base tant que
                la persistance n’est pas opérationnelle.
              </p>
            </section>
            <section id="document" className={s.section}>
              <div className={s.sectionHeading}>
                <span>03</span>
                <div>
                  <h2>Informations du document</h2>
                  <p>
                    Une référence de travail, jamais une émission définitive.
                  </p>
                </div>
              </div>
              <div className={s.grid}>
                <label>
                  Référence du {kind} *
                  {kind === "facture" ? (
                    <input value={serverLocked && draft.reference !== "BROUILLON"
                      ? draft.reference : "Automatique à l'émission"}
                      readOnly aria-label="Numéro fiscal automatique" />
                  ) : (
                    <input value={draft.reference}
                      onChange={(e) => patch({ reference: e.target.value })} />
                  )}
                </label>
                <label>
                  Date du document *
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => patch({ date: e.target.value })}
                  />
                </label>
              </div>
              <p className={s.helper}>
                {serverLocked ? "Numéro définitif enregistré par Logifa. Le document émis est verrouillé." :
                  "Le numéro fiscal sera attribué automatiquement quand tu cliqueras sur « Enregistrer et numéroter ». Le raccourci Ctrl + S conserve uniquement la saisie en préparation."}
              </p>
            </section>
            <section id="prestations" className={s.section}>
              <div className={s.sectionHeading}>
                <span>04</span>
                <div>
                  <h2>
                    Prestations & travaux{" "}
                    <small>{draft.lines.length} postes</small>
                  </h2>
                  <p>
                    Décrivez, chiffrez, organisez. Chaque ligne reste libre.
                  </p>
                </div>
              </div>
              <div className={s.lineTools}>
                <button type="button" onClick={() => addLine("normal")}>
                  ＋ Prestation
                </button>
                <button type="button" onClick={() => addLine("title")}>
                  ＋ Titre de section
                </button>
                <button
                  type="button"
                  className={s.darkButton}
                  onClick={() => setCatalogOpen(true)}
                >
                  Ouvrir le catalogue ↗
                </button>
              </div>
              {!draft.lines.length && (
                <div className={s.empty}>
                  <span aria-hidden>≡</span>
                  <h3>Votre chantier commence ici</h3>
                  <p>
                    Ajoutez une prestation libre ou cherchez dans votre
                    catalogue.
                  </p>
                  <small>Raccourci : Ctrl / ⌘ + Entrée</small>
                </div>
              )}
              <div ref={lineRef} className={s.lines}>
                {draft.lines.map((l, i) => (
                  <LineEditor
                    key={l.key}
                    line={l}
                    index={i}
                    count={draft.lines.length}
                    sectionAmount={sectionAmount(draft.lines, i)}
                    onChange={updateLine}
                    onMove={moveLine}
                    onRemove={removeLine}
                    onDuplicate={duplicateLine}
                  />
                ))}
              </div>
              {undo && (
                <div className={s.notice}>
                  <span>
                    Dernier poste supprimé :{" "}
                    {undo.line.name || "Poste sans intitulé"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const lines = [...draft.lines];
                      lines.splice(
                        Math.min(undo.index, lines.length),
                        0,
                        undo.line,
                      );
                      patch({ lines });
                      setUndo(null);
                      setStatus("Suppression annulée.");
                    }}
                  >
                    Annuler la suppression
                  </button>
                </div>
              )}
            </section>
            <section id="montants" className={s.section}>
              <div className={s.sectionHeading}>
                <span>05</span>
                <div>
                  <h2>Montants & règlements</h2>
                  <p>
                    Le chiffrage du document est distinct de l’argent encaissé.
                  </p>
                </div>
              </div>
              <div className={s.amountGrid}>
                <div>
                  <span>Total HT</span>
                  <strong>{money(amounts.totalHT)}</strong>
                </div>
                <div>
                  <span>TVA calculée</span>
                  <strong>
                    {ttcConfirmed ? money(amounts.totalTVA) : "À confirmer"}
                  </strong>
                </div>
                <div>
                  <span>Total TTC calculé</span>
                  <strong>
                    {ttcConfirmed
                      ? money(amounts.totalTTC)
                      : "À confirmer — TVA ou chiffrage incomplet"}
                  </strong>
                </div>
              </div>
              {kind === "facture" && (
                <>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={draft.showAcompte}
                      onChange={(e) => patch({ showAcompte: e.target.checked })}
                    />
                    Renseigner un acompte déclaré sur ce brouillon
                  </label>
                  {draft.showAcompte && (
                    <div className={s.grid}>
                      <label>
                        Montant de l’acompte (€)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.acompte}
                          onChange={(e) => patch({ acompte: e.target.value })}
                        />
                      </label>
                      <div className={s.lineTotal}>
                        <span>Reste théorique</span>
                        <strong>{money(remaining)}</strong>
                      </div>
                    </div>
                  )}
                  <p className={s.helper}>
                    Le PDF facture actuel conserve une TVA de 0 et un TTC égal
                    au HT. Il ne restitue ni l’acompte ni le reste à payer. Ces
                    valeurs à l’écran ne constituent pas des encaissements
                    vérifiés.
                  </p>
                </>
              )}
              <details className={s.advanced}>
                <summary>Préparer la saisie d’un acompte reçu</summary>
                <p>
                  Saisie locale avant facturation possible. Aucun mouvement
                  bancaire enregistré en base, aucun statut « payé » calculé.
                </p>
                {draft.payments.map((p, i) => (
                  <div key={p.key} className={s.paymentRow}>
                    <label>
                      Montant reçu déclaré (€)
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={p.amount}
                        onChange={(e) =>
                          patch({
                            payments: draft.payments.map((n) =>
                              n.key === p.key
                                ? { ...n, amount: e.target.value }
                                : n,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Date de réception
                      <input
                        type="date"
                        value={p.date}
                        onChange={(e) =>
                          patch({
                            payments: draft.payments.map((n) =>
                              n.key === p.key
                                ? { ...n, date: e.target.value }
                                : n,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Moyen de paiement
                      <select
                        value={p.method}
                        onChange={(e) =>
                          patch({
                            payments: draft.payments.map((n) =>
                              n.key === p.key
                                ? { ...n, method: e.target.value }
                                : n,
                            ),
                          })
                        }
                      >
                        <option value="">Choisir</option>
                        {[
                          "Espèces",
                          "Carte bancaire",
                          "Virement",
                          "Chèque",
                        ].map((method) => (
                          <option key={method}>{method}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      aria-label={`Supprimer la note de règlement ${i + 1}`}
                      onClick={() => {
                        if (window.confirm("Supprimer cette note locale ?"))
                          patch({
                            payments: draft.payments.filter(
                              (n) => n.key !== p.key,
                            ),
                          });
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      payments: [
                        ...draft.payments,
                        {
                          key: crypto.randomUUID(),
                          amount: "",
                          date: "",
                          method: "",
                        },
                      ],
                    })
                  }
                >
                  ＋ Note d’acompte reçu
                </button>
              </details>
              {kind === "facture" && (
                <details className={s.advanced}>
                  <summary>Informations historiques de règlement</summary>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={draft.isPaid}
                      onChange={(e) => patch({ isPaid: e.target.checked })}
                    />
                    Préparer les informations d’une facture déclarée acquittée
                  </label>
                  {draft.isPaid && (
                    <div className={s.grid}>
                      <label>
                        Date de paiement
                        <input
                          type="date"
                          value={draft.paymentDate}
                          onChange={(e) =>
                            patch({ paymentDate: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Moyen de paiement
                        <select
                          value={draft.paymentMethod}
                          onChange={(e) =>
                            patch({ paymentMethod: e.target.value })
                          }
                        >
                          <option value="">Choisir</option>
                          {[
                            "Espèces",
                            "Carte bancaire",
                            "Virement",
                            "Chèque",
                          ].map((method) => (
                            <option key={method}>{method}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Numéro de facture initiale
                        <input
                          value={draft.customInvoiceNumber}
                          onChange={(e) =>
                            patch({ customInvoiceNumber: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Date d’émission initiale
                        <input
                          type="date"
                          value={draft.customInvoiceDate}
                          onChange={(e) =>
                            patch({ customInvoiceDate: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}
                  <p className={s.helper}>
                    Le tampon est bloqué en mode local : les encaissements nets
                    et la chaîne documentaire doivent être vérifiés par les
                    services serveur avant génération.
                  </p>
                  <button type="button" disabled>
                    Version acquittée · vérification serveur requise
                  </button>
                </details>
              )}
            </section>
            <section id="conditions" className={s.section}>
              <div className={s.sectionHeading}>
                <span>06</span>
                <div>
                  <h2>Conditions & notes de travail</h2>
                  <p>Retrouvez les conditions validées du modèle PDF.</p>
                </div>
              </div>
              <div className={s.conditions}>
                <span>30 % à la signature</span>
                <span>30 % au début des travaux</span>
                <span>40 % à la fin des travaux</span>
              </div>
              <p className={s.helper}>
                Conditions et mentions du PDF inchangées. Les notes ci-dessous
                restent dans le brouillon, elles ne sont pas imprimées.
              </p>
              <label>
                Remarques internes
                <textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </label>
              <details className={s.advanced}>
                <summary>Brouillon local & confidentialité</summary>
                <p>
                  Sauvegarde manuelle sur cet appareil, sans chiffrement. Toute
                  personne accédant à ce profil navigateur peut lire ces
                  données. Aucun archivage légal ni sauvegarde serveur. Évitez
                  les données sensibles inutiles.
                </p>
                <div className={s.lineTools}>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(
                        new Blob([JSON.stringify(draft, null, 2)], {
                          type: "application/json",
                        }),
                        `logifa-${kind}-brouillon.json`,
                      )
                    }
                  >
                    Exporter le brouillon
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                  >
                    Importer un brouillon
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!storageKey) return;
                      if (
                        window.confirm(
                          "Effacer uniquement la sauvegarde locale ? La saisie actuelle sera conservée.",
                        )
                      ) {
                        try {
                          localStorage.removeItem(storageKey);
                          setAvailable(null);
                          setSavedClient(null);
                          setStatus(
                            "Copie locale effacée. La saisie est conservée.",
                          );
                        } catch {
                          setStatus("Suppression locale impossible.");
                        }
                      }
                    }}
                  >
                    Effacer la copie locale
                  </button>
                </div>
                <input
                  ref={fileRef}
                  className={s.srOnly}
                  type="file"
                  accept="application/json,.json"
                  aria-label="Fichier de brouillon"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2_000_000)
                        setStatus(
                          "Le fichier de brouillon est trop volumineux.",
                        );
                      else restore(await file.text());
                    }
                    e.target.value = "";
                  }}
                />
              </details>
            </section>
            <section id="apercu" className={s.section}>
              <div className={s.sectionHeading}>
                <span>07</span>
                <div>
                  <h2>Votre document, prêt à relire</h2>
                  <p>Un aperçu exact, généré avec votre modèle PDF habituel.</p>
                </div>
              </div>
              {errors.length > 0 && (
                <div id="editor-errors" className={s.error} role="alert">
                  <strong>Quelques éléments restent à compléter</strong>
                  <ul>
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className={s.lineTools}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => createPdf(false)}
                >
                  {serverLocked ? "Afficher le PDF numéroté" : "Actualiser l’aperçu PDF"}
                </button>
                <button
                  type="button"
                  className={s.darkButton}
                  disabled={busy}
                  onClick={() => createPdf(true)}
                >
                  {busy ? "Préparation…" : "Télécharger le PDF ↗"}
                </button>
              </div>
              {preview ? (
                <>
                  <p className={s.helper}>
                    {serverLocked
                      ? "Document définitif numéroté : " + (serverDocument?.number || draft.reference) + "."
                      : preview.base !== previewSignature
                        ? "La saisie a changé : actualisez cet aperçu avant de vous y fier."
                        : "Aperçu de préparation : aucun numéro fiscal n'est encore attribué."}{" "}
                    <a href={preview.url} target="_blank" rel="noreferrer">
                      Ouvrir le PDF dans un nouvel onglet ↗
                    </a>
                  </p>
                  <iframe
                    className={s.pdfFrame}
                    src={`${preview.url}#view=FitH`}
                    title={`Aperçu PDF du ${kind}`}
                  />
                </>
              ) : (
                <div className={s.empty}>
                  <h3>Relisez le véritable PDF</h3>
                  <p>
                    Complétez le client et vos prestations, puis lancez
                    l’aperçu.
                  </p>
                </div>
              )}
            </section>
          </fieldset>
          <aside className={s.summary}>
            <div className={s.summaryTop}>
              <span>VOTRE {kind.toUpperCase()}</span>
              <span className={s.dot} />
            </div>
            <img src={company.logo} alt="" />
            <h3>{company.name}</h3>
            <p>{draft.client.name || "Client à renseigner"}</p>
            <div className={s.summaryLines}>
              <div>
                <span>Prestations</span>
                <strong>
                  {draft.lines.filter((l) => l.type !== "title").length}
                </strong>
              </div>
              <div>
                <span>Montant HT</span>
                <strong>{money(amounts.totalHT)}</strong>
              </div>
              <div>
                <span>TVA calculée</span>
                <strong>
                  {ttcConfirmed ? money(amounts.totalTVA) : "À confirmer"}
                </strong>
              </div>
            </div>
            <div className={s.grandTotal}>
              <span>Total TTC calculé</span>
              <strong>
                {ttcConfirmed
                  ? money(amounts.totalTTC)
                  : "À confirmer — TVA ou chiffrage incomplet"}
              </strong>
            </div>
            {kind === "facture" && draft.showAcompte && (
              <p>Reste théorique : {money(remaining)}</p>
            )}
            <button
              type="button"
              className={s.primary}
              disabled={busy}
              onClick={() => createPdf(true)}
            >
              Télécharger le PDF <span>↗</span>
            </button>
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById("apercu")
                  ?.scrollIntoView({ behavior: "smooth" });
                createPdf(false);
              }}
            >
              Voir l’aperçu
            </button>
            <p className={s.summaryNote}>
              Création manuelle
              <br />
              {serverLocked ? "Facture émise : " + draft.reference : "Saisie préparatoire — non émise"}
              <br />
              Règlements non vérifiés
            </p>
          </aside>
        </div>
        <footer className={s.bottomBar}>
          <span role="status" aria-live="polite">
            {status ||
              "Tous les champs restent modifiables. Les champs * sont requis pour le PDF."}
          </span>
          {kind === "facture" && storageIssuer && !serverLocked ? (
            <button type="button" disabled={!invoiceReady}
              onClick={() => void invoiceIssueRef.current?.()}>
              Enregistrer et numéroter la facture
            </button>
          ) : !serverLocked ? (
            <button type="button" onClick={saveLocal}>Conserver la saisie</button>
          ) : (
            <strong>Document émis : {draft.reference}</strong>
          )}
        </footer>
      </div>
      {catalogOpen && (
        <div className={s.overlay}>
          <div
            className={s.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Catalogue de prestations"
            onKeyDown={(e) => {
              if (e.key === "Escape") setCatalogOpen(false);
            }}
          >
            <header>
              <div>
                <p className={s.eyebrow}>VOTRE BIBLIOTHÈQUE DE TRAVAUX</p>
                <h2>Le bon poste, en quelques secondes.</h2>
              </div>
              <button
                type="button"
                onClick={() => setCatalogOpen(false)}
                aria-label="Fermer le catalogue"
              >
                ×
              </button>
            </header>
            <div className={s.grid}>
              <label>
                Rechercher une prestation
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Tuile, peinture, gouttière…"
                />
              </label>
              <label>
                Catégorie
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categoryList.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Quantité à insérer *
              <input
                type="number"
                min="0.01"
                step="any"
                value={catalogQuantity}
                onChange={(e) => setCatalogQuantity(e.target.value)}
                placeholder="À renseigner, aucune quantité supposée"
              />
            </label>
            <p className={s.helper}>
              Prix issus du catalogue local, modifiables après insertion. TVA
              initiale 0 %, à vérifier.
            </p>
            <div className={s.catalogResults}>
              {filteredCatalog.map((c, i) => (
                <button
                  type="button"
                  key={`${c.name}-${i}`}
                  disabled={
                    !Number.isFinite(Number(catalogQuantity)) ||
                    Number(catalogQuantity) <= 0
                  }
                  onClick={() => {
                    patch({
                      lines: [
                        ...draft.lines,
                        {
                          key: crypto.randomUUID(),
                          type: "normal",
                          name: c.name,
                          quantity: catalogQuantity,
                          unit: c.unit,
                          price: String(c.price),
                          tva: "0",
                        },
                      ],
                    });
                    setStatus(`Prestation ajoutée : ${c.name}.`);
                  }}
                >
                  <span>
                    <small>{c.category}</small>
                    <strong>{c.name}</strong>
                  </span>
                  <span>
                    {money(c.price)}
                    <small>/ {c.unit}</small>
                  </span>
                  <span aria-hidden>＋</span>
                </button>
              ))}
              {!filteredCatalog.length && (
                <p className={s.empty}>
                  Aucune prestation correspondante. Vous pouvez ajouter une
                  ligne libre.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {proposal && (
        <div className={s.overlay}>
          <div
            className={s.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Modifications proposées"
          >
            <h2>Relire avant d’appliquer</h2>
            <p>
              Ces modifications remplaceront uniquement les champs indiqués.
              Tout le reste est conservé.
            </p>
            <p>
              Les postes suggérés sont à confirmer. Les champs « À compléter »
              restent vides et doivent être renseignés avant génération ou
              émission.
            </p>
            {proposal.changes.map((c, i) => (
              <div key={i} className={s.diff}>
                <strong>{reviewNames[c.field] ?? c.field}</strong>
                <span>{reviewValue(c.field, c.before) || "(vide)"}</span>
                <span>→ {reviewValue(c.field, c.after) || "(vide)"}</span>
              </div>
            ))}
            {!proposal.changes.length && <p>Aucune modification proposée.</p>}
            <div className={s.lineTools}>
              <button type="button" onClick={() => setProposal(null)}>
                Conserver ma saisie
              </button>
              <button
                type="button"
                className={s.darkButton}
                disabled={!proposal.changes.length}
                onClick={() => {
                  if (proposal.base !== JSON.stringify(draft)) {
                    setStatus(
                      "Votre saisie a changé depuis la proposition : examinez-la de nouveau.",
                    );
                    setProposal(null);
                    return;
                  }
                  if (serverLocked) return;
                  setDraft(proposal.next);
                  setProposal(null);
                  setStatus(
                    "Modifications confirmées et appliquées au formulaire manuel.",
                  );
                }}
              >
                Confirmer ces modifications
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
