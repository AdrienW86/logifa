"use client";
import { useEffect, useState } from "react";
import {
  api,
  command,
  selectedIssuer,
  value,
  type Row,
  parseWorkspace,
} from "@/lib/workspace/client";
import { isDraftShape, isRecord } from "@/lib/editor/contracts";
import type { EditorDraft, Company } from "@/types/editor";
import s from "../Workspace/workspace.module.css";
import { depositProposal } from "@/lib/billing/deposit-proposal";
import { lineTotals } from "@/lib/billing/validation";
import { moneyMinor } from "@/lib/billing/money";
import { suggestDeposit } from "@/lib/billing/deposit-schedule";
import { documentInput } from "@/lib/workspace/input";
import { SendDocument } from "../Workspace/Mail";

export default function ServerDocument({
  draft,
  userId,
  onLoad,
  onCompany,
  onLock,
  issueActionRef,
  onIssueAvailable,
}: {
  draft: EditorDraft;
  userId?: string;
  onLoad: (draft: EditorDraft, saved?: boolean) => void;
  onCompany: (company: Company) => void;
  onLock: (locked: boolean) => void;
  issueActionRef?: { current: (() => Promise<void>) | null };
  onIssueAvailable?: (available: boolean) => void;
}) {
  const [issuer, setIssuer] = useState(""),
    [clients, setClients] = useState<Row[]>([]),
    [client, setClient] = useState(""),
    [docs, setDocs] = useState<Row[]>([]),
    [projects, setProjects] = useState<Row[]>([]),
    [project, setProject] = useState(""),
    [source, setSource] = useState(""),
    [correction, setCorrection] = useState(""),
    [reason, setReason] = useState(""),
    [kind, setKind] = useState("classic"),
    [id, setId] = useState(""),
    [revision, setRevision] = useState(0),
    [locked, setLocked] = useState(false),
    [message, setMessage] = useState("Connexion serveur non vérifiée."),
    [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [company, setCompany] = useState<Company | null>(null);
  const documentKind = draft.kind === "devis" ? "quote" : "invoice";
  const fiscal = draft.fiscal ?? {
    operationDate: "",
    dueDate: "",
    purchaseOrder: "",
    operationCategory: "",
  };
  const [extractionQuoteId, setExtractionQuoteId] = useState("");
  const [pdfExtraction, setPdfExtraction] = useState<{
    lines: { type: "normal" | "title"; name: string; quantity: string; unit: string; price: string; tva: string; evidence: string }[];
    warnings: string[];
    totals: {net:string;vat:string;gross:string};
  } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [quoteFiles, setQuoteFiles] = useState<Row[]>([]);
  const [sourceQuotes, setSourceQuotes] = useState<Row[]>([]);
  const [pdfToAttach, setPdfToAttach] = useState<File | null>(null);
  const [attachingPdf, setAttachingPdf] = useState(false);
  const [missingOriginal, setMissingOriginal] = useState(false);
  const [savedVersion, setSavedVersion] = useState("");
  const [numberingHold, setNumberingHold] = useState("");
  const [numberingNext, setNumberingNext] = useState<number | null>(null);
  const [clientKind, setClientKind] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [manualDepositText, setManualDepositText] = useState("");
  const [manualDepositVat, setManualDepositVat] = useState("");
  const [depositAmount, setDepositAmount] = useState(""),
    [depositMode, setDepositMode] = useState<"amount" | "percent">("amount");
  const version = JSON.stringify({
    draft,
    client,
    project,
    source,
    correction,
    reason,
    kind,
  });
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const init = async () => {
      setAvailable(false);
      const query = new URLSearchParams(location.search),
        issuerId = query.get("issuer") ?? selectedIssuer(userId);
      setIssuer(issuerId);
      if (!issuerId) {
        setMessage(
          "Choisissez l’émetteur dans Gestion pour utiliser la sauvegarde serveur. La saisie locale reste disponible.",
        );
        return;
      }
      try {
        const workspace = parseWorkspace(
          await api(`/api/workspace?issuer=${issuerId}`),
        );
        if (!alive) return;
        const profile = workspace.lists.issuer_profiles.find(
          (row) => row.id === issuerId,
        );
        if (!profile) throw new Error("Émetteur introuvable.");
        const legal = workspace.lists.legal_entities.find((row)=>row.id===profile.legal_entity_id);
        const mapped: Company = {
          databaseId: issuerId,
          id: 0,
          name: value(profile, "commercial_name"),
          address: value(profile, "address"),
          cityZip: value(profile, "city_zip"),
          email: value(profile, "email"),
          phone: value(profile, "phone"),
          siret: value(profile, "source_siret"),
          logo: value(profile, "logo_path"),
          color: value(profile, "color") || "#173d32",
          vatRegime: legal ? value(legal, "vat_regime") : "",
        };
        setCompany(mapped);
        onCompany(mapped);
        setClients(workspace.lists.clients.filter((row) => !row.archived_at));
        setProjects(workspace.lists.projects);
        setDocs([...workspace.lists.quotes, ...workspace.lists.invoices]);
        setQuoteFiles(workspace.lists.document_files ?? []);
        setSourceQuotes(workspace.lists.quotes);

        setAvailable(true);
        if (documentKind === "invoice") {
          try {
            const numbering = await api("/api/numbering?issuer=" +
              encodeURIComponent(issuerId));
            if (!alive) return;
            setNumberingHold(numbering.on_hold === true
              ? value(numbering, "hold_reason") || "Numérotation à réconcilier."
              : "");
            setNumberingNext(typeof numbering.next_value === "number"
              ? numbering.next_value : null);
          } catch {
            if (!alive) return;
            setNumberingHold("État de la numérotation indisponible. Vérifiez les paramètres fiscaux.");
          }
        }
        if (documentKind === "invoice" && query.get("fromQuote")) {
          const quoted = workspace.lists.quotes.find((row) =>
            row.id === query.get("fromQuote") && row.issuer_profile_id === issuerId);
          if (!quoted) throw new Error("Devis source introuvable pour cette entreprise.");
          const sourceClient = workspace.lists.clients.find((row) =>
            row.id === quoted.client_id && row.issuer_profile_id === issuerId);
          if (!sourceClient) throw new Error("Client du devis introuvable dans cette entreprise.");
          const fields = isRecord(sourceClient.editor_fields) ? sourceClient.editor_fields : {};
          setSource(value(quoted, "id"));
          setClient(value(quoted, "client_id"));
          setKind("final");
          const preparedDraft: EditorDraft = {
            ...draft,
            issuerScope: issuerId,
            companyKey: "local-issuer-0",
            kind: "facture",
            reference: "BROUILLON",
            isPaid: false,
            showAcompte: false,
            acompte: "0",
            paymentDate: "",
            paymentMethod: "",
            lines: [],
            prompt: "",
            client: {
              name: value(fields, "name") || value(sourceClient, "company_name"),
              street: value(fields, "street") || value(sourceClient, "billing_address"),
              cityZip: value(fields, "cityZip"),
              phone: value(fields, "phone") || value(sourceClient, "phone"),
              email: value(fields, "email") || value(sourceClient, "contact_email"),
              workAddress: value(fields, "workAddress") || value(sourceClient, "work_address"),
            },
          };
          onLoad(preparedDraft);
          setMessage("Devis " + value(quoted, "quote_number") +
            " et client " + preparedDraft.client.name +
            " chargés. Associez son PDF si nécessaire, puis vérifiez les prestations extraites.");
        } else {
          setMessage("Connexion serveur disponible. Un brouillon n’a aucun numéro définitif.");
        }
        const documentId = query.get("document");
        if (documentId) {
          const detail = await api(
            `/api/workspace?document=${documentId}&issuer=${issuerId}&kind=${documentKind}`,
          );
          if (!alive) return;
          const row = detail.row,
            stored = detail.draft;
          if (!isRecord(row)) throw new Error("Document introuvable.");
          if (!isRecord(stored) || !isDraftShape(stored.payload))
            throw new Error(
              "Document historique sans brouillon rééditable : utilisez la bibliothèque des originaux.",
            );
          const duplicate = query.get("duplicate") === "1",
            readonly = !duplicate && row.lifecycle !== "draft";
          const payload = structuredClone(stored.payload);
          payload.companyKey = "local-issuer-0";
          if (duplicate) {
            payload.isPaid = false;
            payload.reference =
              draft.kind === "facture" ? "BROUILLON" : `COPIE-${Date.now()}`;
            payload.date = new Date().toISOString().slice(0, 10);
          } else
            payload.reference =
              value(
                row,
                documentKind === "quote" ? "quote_number" : "invoice_number",
              ) || payload.reference;
          onLoad(payload, true);
          setClient(value(row, "client_id"));
          setSource(duplicate ? "" : value(row, "quote_id"));
          setCorrection(duplicate ? "" : value(row, "correction_of"));
          setKind(
            duplicate ? "classic" : value(row, "document_kind") || "classic",
          );
          setId(duplicate ? "" : documentId);
          setRevision(duplicate ? 0 : Number(stored.revision));
          setProject(value(row, "project_id"));
          setReason(value(row, "credit_reason"));
          setSavedVersion(
            duplicate
              ? ""
              : JSON.stringify({
                  draft: payload,
                  client: value(row, "client_id"),
                  project: value(row, "project_id"),
                  source: value(row, "quote_id"),
                  correction: value(row, "correction_of"),
                  reason: value(row, "credit_reason"),
                  kind: value(row, "document_kind") || "classic",
                }),
          );
          setLocked(readonly);
          onLock(readonly);
          setMessage(
            readonly
              ? "Document émis : formulaire verrouillé. Les originaux sont immuables."
              : "Brouillon serveur réouvert.",
          );
        }
      } catch (error) {
        if (alive)
          setMessage(
            error instanceof Error
              ? error.message
              : "Persistance indisponible.",
          );
      }
    };
    void init();
    return () => {
      alive = false;
    };
    // Mount only: issuer changes navigate to a new document; never overwrite unsaved editor fields silently.
  }, [userId, documentKind]);
  const safe = (work: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opération refusée.");
    } finally {
      setBusy(false);
    }
  };
  const persistPreparation = async () => {
    const result = await command("save", {
      issuer_id: issuer,
      kind: documentKind,
      id: id || undefined,
      revision: revision || undefined,
      payload: draft,
      document: {
        issuer_profile_id: issuer,
        client_id: client,
        project_id: project || undefined,
        quote_id: source || undefined,
        correction_of: correction || undefined,
        credit_reason: reason || undefined,
        document_kind: kind,
        lines: draft.lines.map((line) =>
          line.type === "title"
            ? { type: "title", name: line.name }
            : {
                type: "normal",
                name: line.name,
                quantity: line.quantity,
                unit: line.unit,
                price: line.price,
                tva: line.tva,
              },
        ),
      },
    });
    if (typeof result.id !== "string" || typeof result.revision !== "number")
      throw new Error("Réponse serveur incompatible.");
    setId(result.id);
    setRevision(result.revision);
    setSavedVersion(version);
    onLoad(draft, true);
    setMessage("Saisie enregistrée en préparation, sans numéro fiscal.");
    return result.id;
  };
  const save = async () => {
    if (!confirm("Conserver cette saisie en préparation, sans attribuer de numéro fiscal ?")) return;
    await persistPreparation();
  };
  const issueWithNumber = async () => {
    if (draft.kind !== "facture" || !issuer || !client)
      throw new Error("Choisissez une entreprise et un client avant d'enregistrer la facture.");
    if (!fiscal.operationDate || !fiscal.dueDate || !fiscal.operationCategory)
      throw new Error("Renseignez la date de prestation (ou d'acompte), l'échéance et la nature des opérations.");
    if (numberingHold) {
      setMessage("Numéro indisponible : " + numberingHold +
        ". Dans Couverture Catalane → Modèles et réglages → Connexions et fiscalité, validez la reprise de la série avant l'émission. La facture peut rester en préparation.");
      return;
    }
    if (!confirm("ENREGISTRER ET ÉMETTRE DÉFINITIVEMENT cette facture ? Un numéro fiscal sera attribué. La facture ne pourra plus être modifiée librement. L'envoi au client reste séparé."))
      return;
    const savedId = await persistPreparation();
    let issued: Row;
    try {
      issued = await command("issue", {
        issuer_id: issuer, kind: "invoice", id: savedId, date: draft.date,
      }, true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Émission non confirmée";
      if (detail.includes("LOGIFA_NUMBERING_RECONCILIATION_REQUIRED")) {
        setMessage("Saisie conservée, mais émission bloquée : la série de numéros de cette entreprise doit être réconciliée avant de produire une facture réelle.");
        return;
      }
      setMessage("Saisie conservée. Émission non confirmée : "+detail+". Vérifiez le statut serveur avant de réessayer.");
      return;
    }
    const number = value(issued,"number") || value(issued,"invoice_number");
    if (!number) throw new Error("Émission enregistrée mais numéro non renvoyé : rechargez le document avant toute nouvelle action.");
    setLocked(true);
    onLock(true);
    onLoad({...draft,reference:number}, true);
    setNumberingNext((previous) => previous===null ? null : previous+1);
    setMessage("Facture "+number+" émise et verrouillée. Archivage PDF en cours…");
    try {
      await api(`/api/invoices/${savedId}/pdf?issuer=${issuer}&confirmed=1`, {method:"POST"});
      setMessage("Facture "+number+" enregistrée, numérotée et PDF original archivé. Vous pouvez l'envoyer au client.");
    } catch (error) {
      setMessage("Facture "+number+" bien émise, mais archivage PDF à terminer depuis « Archiver l'original ». Aucun deuxième numéro ne doit être demandé : "+
        (error instanceof Error ? error.message : "Erreur archivage"));
    }
  };
  useEffect(() => {
    if (!issueActionRef) return;
    issueActionRef.current = safe(issueWithNumber);
    return () => { issueActionRef.current = null; };
  });
  useEffect(() => {
    onIssueAvailable?.(available && !!issuer && !locked && documentKind === "invoice");
  }, [available, issuer, locked, documentKind, onIssueAvailable]);
  const createClient = async () => {
    if (clientKind !== "individual" && clientKind !== "professional")
      throw new Error(
        "Choisissez particulier ou professionnel avant de créer la fiche.",
      );
    if (!draft.client.name.trim())
      throw new Error("Renseignez le nom du client.");
    if (
      clients.some(
        (row) =>
          value(row, "company_name").trim().toLowerCase() ===
          draft.client.name.trim().toLowerCase(),
      ) &&
      !confirm(
        "Une fiche de ce nom existe déjà chez cet émetteur. Créer tout de même un homonyme distinct ?",
      )
    )
      return;
    if (
      !confirm(
        "Créer une fiche client propre à cet émetteur à partir des champs manuels ?",
      )
    )
      return;
    const result = await command(
      "client",
      {
        issuer_id: issuer,
        client_kind: clientKind,
        company_name: draft.client.name,
        contact_email: draft.client.email,
        phone: draft.client.phone,
        billing_address: draft.client.street,
        work_address: draft.client.workAddress,
        editor_fields: draft.client,
      },
      true,
    );
    if (typeof result.id !== "string")
      throw new Error("Réponse serveur incompatible.");
    setClient(result.id);
    setClients((current) => [
      ...current,
      {
        id: result.id,
        company_name: draft.client.name,
        editor_fields: draft.client,
      },
    ]);
    setMessage("Fiche client créée pour cet émetteur.");
  };
  const chooseClient = (row: Row) => {
    if (
      !confirm(
        "Reprendre les coordonnées de cette fiche client dans le formulaire ?",
      )
    )
      return;
    setClient(value(row, "id"));
    const fields = isRecord(row.editor_fields) ? row.editor_fields : {};
    onLoad({
      ...draft,
      client: {
        name: value(fields, "name") || value(row, "company_name"),
        street: value(fields, "street") || value(row, "billing_address"),
        cityZip: value(fields, "cityZip"),
        phone: value(fields, "phone") || value(row, "phone"),
        email: value(fields, "email") || value(row, "contact_email"),
        workAddress: value(fields, "workAddress") || value(row, "work_address"),
      },
    });
  };
  const extractQuotePdf = async (quoteId: string) => {
    setExtracting(true);
    setPdfExtraction(null);
    try {
      const result = await api("/api/documents/extract-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, quoteId, issuerId: issuer }),
      });
      if (!Array.isArray(result.lines) || !Array.isArray(result.warnings) ||
        !isRecord(result.totals)) throw new Error("Extraction incompatible.");
      setPdfExtraction(result as unknown as NonNullable<typeof pdfExtraction>);
      setExtractionQuoteId(quoteId);
      setMissingOriginal(false);
      setMessage("Prestations extraites. Vérifiez les prix, quantités, TVA et totaux avant de les appliquer.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analyse impossible.";
      if (message.includes("PDF_ORIGINAL_REQUIRED")) {
        setMissingOriginal(true);
        setMessage("Le PDF manque dans les archives de ce devis. Sélectionnez-le et associez-le ci-dessous.");
      } else {
        setMessage("Extraction impossible : " + message);
      }
      throw error;
    } finally {
      setExtracting(false);
    }
  };
  const chosenClient = clients.find((row) => row.id === client);
  const knownAddresses =
    chosenClient && Array.isArray(chosenClient.addresses)
      ? chosenClient.addresses.flatMap((raw) =>
          typeof raw === "string"
            ? [raw]
            : isRecord(raw)
              ? [
                  Object.values(raw)
                    .filter((value) => typeof value === "string")
                    .join(" "),
                ]
              : [],
        )
      : [];
  return (
    <section
      className={s.card}
      style={{ marginBottom: 20 }}
      aria-label="Document serveur"
    >
      <h2>Cycle de vie et sauvegarde serveur</h2>
      <p role="status">{message}</p>
      {available && draft.kind === "facture" && !locked && numberingHold && (
        <div role="alert" className={s.card} style={{marginBottom: 14}}>
          <strong>Numéro de facture indisponible : série à vérifier</strong>
          <p>{numberingHold}</p>
          <p>La facture peut être préparée et conservée, mais aucun numéro définitif
            ne sera attribué avant la réconciliation de la série existante.</p>
          <a href="/gestion/parametres">Ouvrir les réglages → Connexions et fiscalité</a>
        </div>
      )}
      {available && draft.kind === "facture" && !locked && !numberingHold &&
        numberingNext !== null && (
          <p>Numérotation automatique activée. Prochain compteur indicatif :
            <strong> {numberingNext}</strong>. La référence définitive sera réservée
            par le serveur lors de l'émission, selon sa date.</p>
        )}
      {available && draft.kind === "facture" && source && !locked &&
        sourceQuotes.some((row)=>row.id===source && row.status!=="accepted") && (
          <div role="status" className={s.card} style={{marginBottom: 14}}>
            <strong>Accord du client à vérifier sur le devis d'origine</strong>
            <p>Ce devis ne possède pas encore le statut « accepté ».
              Vérifiez l'accord client depuis la liste des devis avant d'émettre
              la facture. L'extraction du PDF ne vaut pas acceptation.</p>
            <a href="/gestion/devis">Ouvrir les devis de cette entreprise</a>
          </div>
        )}
      {available && draft.kind === "facture" && source && !locked && (
        <div className={s.card} style={{marginBottom:16}}>
          <h3>Créer la facture depuis le devis PDF</h3>
          {(() => {
            const sourceQuote = sourceQuotes.find((row) => row.id === source);
            const hasPdf = quoteFiles.some((row) => row.quote_id === source &&
              (row.role === "original" || row.role === "signed"));
            if ((hasPdf && !missingOriginal) || sourceQuote?.lifecycle !== "historical")
              return null;
            return (
              <div role="group" aria-label="Compléter le PDF manquant" style={{marginBottom:16}}>
                <p><strong>Étape 1 — Ajouter le PDF original au devis déjà enregistré.</strong></p>
                <p>Le devis et le client sont conservés. Sélectionnez son fichier PDF, puis validez son archivage. La simple sélection du fichier ne l'enregistre pas.</p>
                <label style={{display:"grid",gap:8}}>
                  Choisir le PDF du devis
                  <input type="file" accept="application/pdf,.pdf"
                    aria-label="PDF original du devis historique"
                    disabled={attachingPdf || extracting}
                    onChange={(event) => {
                      setPdfToAttach(event.currentTarget.files?.[0] ?? null);
                    }} />
                </label>
                <p role="status">
                  {pdfToAttach
                    ? "Fichier sélectionné : " + pdfToAttach.name + " — prêt à être associé."
                    : "Aucun PDF sélectionné. Le bouton suivant sera disponible après le choix d'un fichier."}
                </p>
                <button type="button" disabled={!pdfToAttach || attachingPdf || extracting || busy}
                  onClick={async () => {
                    if (!pdfToAttach || !confirm(
                      "Associer ce PDF au devis historique, puis l'analyser avec OpenAI ? Le PDF est conservé comme original immuable et transmis à OpenAI pour extraction. Aucun document fiscal n'est émis."
                    )) return;
                    setAttachingPdf(true);
                    let archived = false;
                    try {
                      const body = new FormData();
                      body.set("confirmed", "true");
                      body.set("issuer_id", issuer);
                      body.set("quote_id", source);
                      body.set("file", pdfToAttach);
                      const result = await api("/api/documents/attach-original", {
                        method: "POST", body,
                      });
                      archived = true;
                      setQuoteFiles((previous) => [...previous, {
                        id: isRecord(result.archived) ? result.archived.id : "",
                        quote_id: source,
                        role: "original",
                      }]);
                      setPdfToAttach(null);
                      setMissingOriginal(false);
                      setMessage("PDF associé au devis historique. Extraction en cours…");
                      await extractQuotePdf(source);
                    } catch (error) {
                      if (!archived) {
                        setMessage("Le PDF n'a pas été associé : " +
                          (error instanceof Error ? error.message : "Erreur d'archivage."));
                      } else {
                        setMessage("PDF bien associé, mais extraction à relancer : " +
                          (error instanceof Error ? error.message : "Erreur IA."));
                      }
                    } finally {
                      setAttachingPdf(false);
                    }
                  }}>
                  {attachingPdf ? "Archivage et analyse en cours…" : "Étape 2 — Associer ce PDF et analyser le devis"}
                </button>
              </div>
            );
          })()}
          <p>Extraction assistée depuis le PDF original archivé. Aucun tarif, taux de TVA ni quantité ne sera inventé. La facture restera en brouillon jusqu'à votre validation.</p>
          {quoteFiles.some((row) => row.quote_id === source &&
            (row.role === "original" || row.role === "signed")) && (
          <div className={s.actions}>
            <button type="button"
              disabled={extracting || attachingPdf || busy || !issuer}
              onClick={async () => {
                if (!confirm("Analyser ce devis PDF avec OpenAI ? Le PDF sera transmis pour extraction. Aucun document n'est émis ni enregistré.")) return;
                try { await extractQuotePdf(source); } catch { /* Message affiché par extractQuotePdf. */ }
              }}>
              {extracting ? "Analyse du PDF en cours…" : "Relancer l'extraction du PDF"}
            </button>
          </div>
          )}
          {pdfExtraction && (
            <div>
              <h4>Prévisualisation — {pdfExtraction.lines.length} ligne(s)</h4>
              <p>Totaux lus : HT {pdfExtraction.totals.net || "non trouvé"} € · TVA {pdfExtraction.totals.vat || "non trouvée"} € · TTC {pdfExtraction.totals.gross || "non trouvé"} €</p>
              <div style={{overflowX:"auto"}}>
                <table><thead><tr><th>Prestation</th><th>Qté</th><th>Unité</th><th>PU HT</th><th>TVA %</th></tr></thead>
                <tbody>{pdfExtraction.lines.map((line,i)=><tr key={i}>
                  <td>{line.name}</td><td>{line.quantity || "À vérifier"}</td>
                  <td>{line.unit || "À vérifier"}</td><td>{line.price || "À vérifier"}</td>
                  <td>{line.tva || "À vérifier"}</td>
                </tr>)}</tbody></table>
              </div>
              {pdfExtraction.warnings.length > 0 &&
                <div role="alert"><strong>Points à contrôler</strong><ul>
                  {pdfExtraction.warnings.map((w,i)=><li key={i}>{w}</li>)}
                </ul></div>}
              <button type="button" disabled={busy} onClick={()=>{
                if (draft.lines.length && !confirm("Remplacer les lignes déjà saisies par les lignes extraites ?")) return;
                const incoming = pdfExtraction.lines.map((line)=>({
                  type:line.type, key:crypto.randomUUID(), name:line.name,
                  quantity:line.quantity, unit:line.unit, price:line.price,tva:line.tva,
                }));
                onLoad({...draft,lines:incoming,isPaid:false,showAcompte:false,acompte:"0"});
                setPdfExtraction(null);
                setMessage("Lignes reprises dans le brouillon. Complétez les valeurs manquantes et contrôlez les totaux avant la sauvegarde.");
              }}>Appliquer les lignes au brouillon</button>
              <button type="button" disabled={busy || extracting} onClick={safe(async()=>{
                if (!pdfExtraction) return;
                const items = pdfExtraction.lines.filter((line)=>
                  line.type==="normal" && line.quantity && line.price && Number(line.price)>0 &&
                  line.tva && line.unit && line.evidence);
                if (!items.length) throw new Error("Aucun tarif documenté et exploitable.");
                if (!confirm(`Proposer ${items.length} tarif(s) provenant de ce PDF au catalogue privé de l'entreprise ? Ils resteront inactifs jusqu'à votre validation et ne seront pas considérés comme des tarifs actuels.`)) return;
                const result = await api("/api/catalogue",{
                  method:"POST",headers:{"Content-Type":"application/json"},
                  body:JSON.stringify({confirmed:true,action:"suggest_from_quote",
                    issuer,quote_id:source,items}),
                });
                setMessage(`${result.suggested ?? 0} tarif(s) proposé(s). Rendez-vous dans les réglages de l'entreprise pour valider ou archiver chaque suggestion avant utilisation par l'IA.`);
              })}>Proposer les tarifs de ce PDF au catalogue (validation requise)</button>
            </div>
          )}
        </div>
      )}
      {available && clientSearch && !locked && (
        <div className={s.actions} aria-label="Suggestions de clients">
          {clients
            .filter((row) =>
              value(row, "company_name")
                .toLowerCase()
                .includes(clientSearch.toLowerCase()),
            )
            .slice(0, 10)
            .map((row) => (
              <button
                key={value(row, "id")}
                type="button"
                onClick={() => chooseClient(row)}
              >
                {value(row, "company_name")} · {value(row, "contact_email")}
              </button>
            ))}
        </div>
      )}
      {available && knownAddresses.length > 0 && (
        <label>
          Adresses de chantier connues
          <select
            disabled={locked}
            value=""
            onChange={(event) => {
              if (
                event.target.value &&
                confirm("Reprendre cette adresse de chantier ?")
              )
                onLoad({
                  ...draft,
                  client: { ...draft.client, workAddress: event.target.value },
                });
            }}
          >
            <option value="">Choisir une adresse</option>
            {knownAddresses.map((address, index) => (
              <option key={index} value={address}>
                {address}
              </option>
            ))}
          </select>
        </label>
      )}
      {available && id && locked && (
        <SendDocument
          issuer={issuer}
          documentId={id}
          kind={documentKind}
          recipient={draft.client.email}
        />
      )}
      {available && draft.kind === "facture" && (
        <div className={s.actions}>
          <label>
            Date de prestation / versement de l’acompte
            <input
              type="date"
              disabled={locked}
              value={fiscal.operationDate}
              onChange={(e) =>
                onLoad({
                  ...draft,
                  fiscal: { ...fiscal, operationDate: e.target.value },
                })
              }
            />
          </label>
          <label>
            Date d’échéance du paiement
            <input
              type="date"
              disabled={locked}
              value={fiscal.dueDate}
              onChange={(e) =>
                onLoad({
                  ...draft,
                  fiscal: { ...fiscal, dueDate: e.target.value },
                })
              }
            />
          </label>
          <label>
            Bon de commande (si établi)
            <input
              disabled={locked}
              value={fiscal.purchaseOrder}
              onChange={(e) =>
                onLoad({
                  ...draft,
                  fiscal: { ...fiscal, purchaseOrder: e.target.value },
                })
              }
            />
          </label>
          <label>
            Nature des opérations
            <select
              disabled={locked}
              value={fiscal.operationCategory}
              onChange={(e) =>
                onLoad({
                  ...draft,
                  fiscal: { ...fiscal, operationCategory: e.target.value },
                })
              }
            >
              <option value="">À renseigner</option>
              <option value="services">Prestations de services</option>
              <option value="goods">Livraisons de biens</option>
              <option value="mixed">Biens et services</option>
            </select>
          </label>
        </div>
      )}
      {available && (
        <>
          <div className={s.actions}>
            <label>
              Rechercher un client du carnet
              <input
                aria-label="Rechercher un client du carnet"
                value={clientSearch}
                disabled={locked}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </label>
            <label>
              Client de cet émetteur
              <select
                aria-label="Client serveur"
                value={client}
                disabled={locked}
                onChange={(event) => {
                  const row = clients.find((c) => c.id === event.target.value);
                  if (!row) {
                    setClient("");
                    return;
                  }
                  if (
                    !confirm(
                      "Reprendre les coordonnées de cette fiche client dans le formulaire ?",
                    )
                  )
                    return;
                  setClient(event.target.value);
                  const saved = row.editor_fields;
                  if (
                    isRecord(saved) &&
                    [
                      "name",
                      "street",
                      "cityZip",
                      "phone",
                      "email",
                      "workAddress",
                    ].every((key) => typeof saved[key] === "string")
                  )
                    onLoad({
                      ...draft,
                      client: {
                        name: String(saved.name),
                        street: String(saved.street),
                        cityZip: String(saved.cityZip),
                        phone: String(saved.phone),
                        email: String(saved.email),
                        workAddress: String(saved.workAddress),
                      },
                    });
                  else
                    onLoad({
                      ...draft,
                      client: {
                        name: value(row, "company_name"),
                        street: value(row, "billing_address"),
                        cityZip: "",
                        phone: value(row, "phone"),
                        email: value(row, "contact_email"),
                        workAddress: value(row, "work_address"),
                      },
                    });
                }}
              >
                <option value="">Choisir un client</option>
                {clients
                  .filter((row) =>
                    value(row, "company_name")
                      .toLowerCase()
                      .includes(clientSearch.toLowerCase()),
                  )
                  .map((row) => (
                    <option key={value(row, "id")} value={value(row, "id")}>
                      {value(row, "company_name")}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Type du nouveau client
              <select
                value={clientKind}
                disabled={locked}
                onChange={(e) => setClientKind(e.target.value)}
              >
                <option value="">Choisir explicitement</option>
                <option value="individual">Particulier</option>
                <option value="professional">Professionnel</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy || locked}
              onClick={safe(createClient)}
            >
              Créer le client depuis ma saisie
            </button>
            <label>
              Chantier
              <select
                value={project}
                disabled={locked}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">Sans chantier</option>
                {projects
                  .filter((p) => p.client_id === client)
                  .map((p) => (
                    <option key={value(p, "id")} value={value(p, "id")}>
                      {value(p, "name")}
                    </option>
                  ))}
              </select>
            </label>
            {draft.kind === "facture" && (
              <>
                <label>
                  Type de facture
                  <select
                    aria-label="Type de facture"
                    value={kind}
                    disabled={locked}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="classic">Classique</option>
                    <option value="deposit">Acompte</option>
                    <option value="final">Finale / solde</option>
                    <option value="credit">Avoir</option>
                  </select>
                </label>
                <label>
                  Devis source
                  <select
                    value={source}
                    disabled={locked}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Sans devis</option>
                    {docs
                      .filter(
                        (d) => d.client_id === client && "quote_number" in d,
                      )
                      .map((d) => (
                        <option key={value(d, "id")} value={value(d, "id")}>
                          {value(d, "quote_number") || "Brouillon"}
                        </option>
                      ))}
                  </select>
                </label>
                {kind === "credit" && (
                  <>
                    <label>
                      Facture d’origine
                      <select
                        value={correction}
                        disabled={locked}
                        onChange={(e) => setCorrection(e.target.value)}
                      >
                        <option value="">Choisir</option>
                        {docs
                          .filter(
                            (d) =>
                              d.client_id === client &&
                              "invoice_number" in d &&
                              d.document_kind !== "credit",
                          )
                          .map((d) => (
                            <option key={value(d, "id")} value={value(d, "id")}>
                              {value(d, "invoice_number")}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Motif documenté
                      <input
                        value={reason}
                        disabled={locked}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                  </>
                )}
              </>
            )}
          </div>
          <p>
            Choisir un type ne calcule ni montant ni TVA par supposition. Un
            acompte doit décrire seulement l’opération facturée. Une finale
            reprend le périmètre réel et ses acomptes déjà facturés.
          </p>
          {draft.kind === "facture" && kind === "deposit" && !source && !locked && (
            <div className={s.card} role="group" aria-label="Acompte libre sans devis">
              <h3>Facture d'acompte libre — sans devis</h3>
              <p>Vous pouvez établir un acompte sans devis. Indiquez précisément l'opération, le montant HT et le régime de TVA réel. Aucun montant ni taux ne sera supposé. Pour gérer plusieurs acomptes et le solde d'un même chantier sans devis, sélectionnez d'abord le chantier commun.</p>
              <label>Nature des travaux / prestation concernés
                <input value={manualDepositText} maxLength={300} onChange={(e) => setManualDepositText(e.target.value)}
                  placeholder="Ex. Acompte avant travaux de réfection de couverture" />
              </label>
              <label>Montant de cet acompte HT (€)
                <input inputMode="decimal" value={depositAmount} onChange={(e)=>setDepositAmount(e.target.value)}
                  placeholder="Montant HT à facturer, libre" />
              </label>
              <label>Taux de TVA applicable (choix obligatoire)
                <select value={manualDepositVat} onChange={(e)=>setManualDepositVat(e.target.value)}>
                  <option value="">À vérifier et sélectionner</option>
                  <option value="0">0 % — régime non redevable ou exonéré à confirmer</option>
                  <option value="5.5">5,5 %</option>
                  <option value="10">10 %</option>
                  <option value="20">20 %</option>
                </select>
              </label>
              <button type="button" disabled={busy} onClick={safe(async()=>{
                const amount = depositAmount.trim().replace(",",".");
                if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount)<=0)
                  throw new Error("Indiquez un montant HT positif en euros.");
                if (!manualDepositVat || !manualDepositText.trim())
                  throw new Error("Précisez la nature des travaux et validez la TVA applicable.");
                if (draft.lines.length && !confirm("Remplacer les lignes existantes par cet acompte libre ?")) return;
                onLoad({...draft,lines:[{
                  key:crypto.randomUUID(),type:"normal",name:manualDepositText.trim(),
                  quantity:"1",unit:"forfait",price:amount,tva:manualDepositVat,
                }]});
                setMessage("Acompte libre préparé. Vérifiez la TVA et les données avant d'enregistrer.");
              })}>Insérer cet acompte dans la facture</button>
            </div>
          )}
          {draft.kind === "facture" && kind === "deposit" && source && !locked && (() => {
            const quote = docs.find((d) => d.id === source && "quote_number" in d);
            if (!quote) return null;
            const previous = docs.filter((d) => d.quote_id === source &&
              d.document_kind === "deposit" && d.id !== id &&
              (d.lifecycle === "issued" || d.lifecycle === "historical"));
            const base = Number(quote.total_gross);
            if (!Number.isFinite(base) || base<=0) return <p>Montant du devis source indisponible.</p>;
            const total = base.toFixed(2);
            const previousAmounts = previous.map((d)=>Number(d.total_gross).toFixed(2));
            const invoiced = previousAmounts.reduce((sum,x)=>sum+Number(x),0);
            return (
              <div className={s.card} role="group" aria-label="Échéancier d'acomptes">
                <h3>Échéancier d'acomptes</h3>
                <p>Montant contractuel TTC : <strong>{total} €</strong> · acomptes déjà facturés : <strong>{invoiced.toFixed(2)} €</strong> · reste non facturé : <strong>{(base-invoiced).toFixed(2)} €</strong>.</p>
                <p>Les pourcentages s'appliquent toujours au total initial du devis et non au montant restant. Les factures déjà émises sont prises en compte, indépendamment de leur paiement.</p>
                <div className={s.actions}>
                  {([{step:"first30",label:"Premier acompte · 30 %"},
                     {step:"second30",label:"Deuxième acompte · 30 %"}] as const).map(({step,label})=>
                    <button type="button" key={step} disabled={busy} onClick={safe(async()=>{
                      const proposal=suggestDeposit(total,previousAmounts,step);
                      setDepositAmount(proposal.proposalGross);
                      setDepositMode("amount");
                      setMessage(label+" : "+proposal.proposalGross+" € TTC proposés. Cliquez ensuite sur « Proposer les lignes depuis le devis » pour ventiler la TVA et relisez le résultat.");
                    })}>{label}</button>
                  )}
                </div>
              </div>
            );
          })()}
          <div className={s.actions}>
            {draft.kind === "facture" &&
              source &&
              (kind === "deposit" || kind === "final") && (
                <>
                  <label>
                    Proposition d acompte
                    <input
                      value={depositAmount}
                      disabled={locked || kind !== "deposit"}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Montant TTC ou pourcentage"
                    />
                  </label>
                  <select
                    value={depositMode}
                    disabled={locked || kind !== "deposit"}
                    onChange={(e) =>
                      setDepositMode(
                        e.target.value === "percent" ? "percent" : "amount",
                      )
                    }
                  >
                    <option value="amount">Montant TTC</option>
                    <option value="percent">Pourcentage du devis</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy || locked}
                    onClick={safe(async () => {
                      const detail = await api(
                        `/api/workspace?document=${source}&issuer=${issuer}&kind=quote`,
                      );
                      if (!isRecord(detail.row) || detail.row.client_id !== client)
                        throw new Error("Le devis source n'appartient pas à ce client.");
                      const hasEditor = isRecord(detail.draft) &&
                        isDraftShape(detail.draft.payload);
                      const extracted = pdfExtraction && extractionQuoteId === source
                        ? pdfExtraction.lines : null;
                      if (!hasEditor && !extracted)
                        throw new Error("Ce devis a été importé en PDF. Extrayez d'abord ses prestations dans le panneau ci-dessus avant de calculer un acompte.");
                      const fullLines = hasEditor
                        ? (detail.draft as { payload: EditorDraft }).payload.lines
                        : extracted!.map((line) => ({
                            key: crypto.randomUUID(),type:line.type,name:line.name,
                            quantity:line.quantity, unit:line.unit,
                            price:line.price,tva:line.tva,
                          }));
                      const normalized = documentInput({
                        issuer_profile_id: issuer,client_id: client,lines:fullLines,
                      }).lines;
                      if (!hasEditor) {
                        const expected = moneyMinor(Number(detail.row.total_gross).toFixed(2));
                        if (lineTotals(normalized).gross !== expected)
                          throw new Error("Les lignes extraites ne correspondent pas au total TTC du devis. Vérifiez le PDF avant de calculer l'acompte.");
                      }
                      const lines =
                        kind === "final"
                          ? fullLines
                          : depositProposal(normalized,
                              depositAmount.replace(",", "."),
                              depositMode,
                              value(detail.row, "quote_number"),
                            );
                      if (
                        !confirm(
                          "Remplacer les lignes par la proposition calculee depuis le devis reel ? Relisez la TVA et la description avant emission.",
                        )
                      )
                        return;
                      onLoad({ ...draft, lines: structuredClone(lines) });
                      setMessage(
                        "Lignes proposees depuis le document source. Aucun paiement suppose.",
                      );
                    })}
                  >
                    Proposer les lignes depuis le devis
                  </button>
                </>
              )}
            {draft.kind === "facture" && (
              <button type="button" disabled={busy || locked || !client}
                onClick={safe(issueWithNumber)}>
                Enregistrer et numéroter la facture
              </button>
            )}
            <button type="button" disabled={busy || locked || !client} onClick={safe(save)}>
              {draft.kind === "facture" ? "Conserver ma saisie (sans numéro)" : "Enregistrer le devis en préparation"}
            </button>
            {id && !locked && (
              <a
                href={`/api/${documentKind === "quote" ? "quotes" : "invoices"}/${id}/pdf?issuer=${issuer}`}
                target="_blank"
                rel="noreferrer"
              >
                Relire le PDF serveur de la version sauvegardée (BROUILLON)
              </a>
            )}
            {draft.kind === "devis" && (
            <button
              type="button"
              disabled={busy || locked || !id || version !== savedVersion}
              onClick={safe(async () => {
                if (version !== savedVersion)
                  throw new Error(
                    "Sauvegardez la version actuelle avant emission.",
                  );
                if (
                  !confirm(
                    "Émettre définitivement la version sauvegardée ? Le numéro est attribué transactionnellement et le document devient immuable. Sauvegardez vos dernières modifications avant de continuer.",
                  )
                )
                  return;
                const result = await command(
                  "issue",
                  {
                    issuer_id: issuer,
                    kind: documentKind,
                    id,
                    date: draft.date,
                  },
                  true,
                );
                setLocked(true);
                onLock(true);
                const number =
                  typeof result.number === "string"
                    ? result.number
                    : value(
                        result,
                        documentKind === "quote"
                          ? "quote_number"
                          : "invoice_number",
                      );
                onLoad({ ...draft, reference: number || draft.reference });
                setMessage("Devis "+number+" émis. Archivage de son PDF original…");
                try {
                  await api(`/api/quotes/${id}/pdf?issuer=${issuer}&confirmed=1`,{
                    method:"POST",
                  });
                  setMessage("Devis "+number+" émis, numéroté et PDF original archivé.");
                } catch(error) {
                  setMessage("Devis "+number+" émis, mais PDF à archiver manuellement : "+
                    (error instanceof Error?error.message:"Erreur d'archivage"));
                }
              })}
            >
              Émettre le devis sauvegardé
            </button>
            )}
            {draft.kind === "facture" && kind === "final" && id && !locked &&
              (Boolean(source) || Boolean(project)) && (
              <button type="button" disabled={busy} onClick={safe(async () => {
                const deposits = docs.filter((d) =>
                  d.client_id === client &&
                  d.document_kind === "deposit" &&
                  (d.lifecycle === "issued" || d.lifecycle === "historical") &&
                  (source
                    ? d.quote_id === source
                    : d.project_id === project && !d.quote_id));
                if (!deposits.length) {
                  setMessage("Aucun acompte déjà facturé sur ce devis/chantier.");
                  return;
                }
                if (!confirm(`Associer ${deposits.length} facture(s) d'acompte à cette finale ? Les montants déductibles et la TVA seront contrôlés par le serveur avant émission.`))
                  return;
                const linked = await command("link-all-deposits",{
                  issuer_id: issuer, final_id: id,
                },true);
                const count=Number(linked.linked_count);
                if (!Number.isInteger(count) || count<0)
                  throw new Error("Résultat de rattachement invalide.");
                setMessage(count+" acomptes associés dans une seule opération contrôlée par le serveur.");

              })}>Associer tous les acomptes déjà facturés à la finale</button>
            )}
            {draft.kind === "facture" && kind === "final" && id && !locked && (
              <label>
                Acompte déjà facturé à déduire
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const deposit = e.target.value;
                    if (!deposit) return;
                    void safe(async () => {
                      if (
                        !confirm(
                          "Lier cet acompte à la finale ? Son montant net sera contrôlé par le serveur à l’émission.",
                        )
                      )
                        return;
                      await command(
                        "link-deposit",
                        {
                          issuer_id: issuer,
                          final_id: id,
                          deposit_id: deposit,
                        },
                        true,
                      );
                      setMessage(
                        "Acompte lié. Le serveur empêche son réemploi sur une autre finale.",
                      );
                    })();
                  }}
                >
                  <option value="">Choisir</option>
                  {docs
                    .filter(
                      (d) =>
                        d.client_id === client &&
                        d.document_kind === "deposit" &&
                        d.lifecycle === "issued",
                    )
                    .map((d) => (
                      <option key={value(d, "id")} value={value(d, "id")}>
                        {value(d, "invoice_number")}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {id && locked && draft.kind === "devis" && (
              <>
                <a
                  href={`/api/quotes/${id}/pdf?issuer=${issuer}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF serveur du devis
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={safe(async () => {
                    if (
                      !confirm("Archiver le devis original sans ecrasement ?")
                    )
                      return;
                    await api(
                      `/api/quotes/${id}/pdf?issuer=${issuer}&confirmed=1`,
                      { method: "POST" },
                    );
                    setMessage("Devis original archive.");
                  })}
                >
                  Archiver le devis original
                </button>
              </>
            )}
            {id && locked && draft.kind === "facture" && (
              <>
                <a
                  href={`/api/invoices/${id}/pdf?issuer=${issuer}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF fiscal serveur
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={safe(async () => {
                    if (
                      !confirm(
                        "Archiver le PDF original prive sans ecrasement ?",
                      )
                    )
                      return;
                    await api(
                      `/api/invoices/${id}/pdf?issuer=${issuer}&confirmed=1`,
                      { method: "POST" },
                    );
                    setMessage("Original archive separement.");
                  })}
                >
                  Archiver l original
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={safe(async () => {
                    if (
                      !confirm(
                        "Generer et archiver une variante ACQUITTEE ? Les encaissements nets seront verifies par le serveur.",
                      )
                    )
                      return;
                    await api(
                      `/api/invoices/${id}/pdf?issuer=${issuer}&paid=1&confirmed=1`,
                      { method: "POST" },
                    );
                    setMessage(
                      "Variante acquittee archivee ; original conserve.",
                    );
                  })}
                >
                  Creer une variante acquittee
                </button>
              </>
            )}
            {id && (
              <a href="/gestion/documents">Consulter les originaux archivés</a>
            )}
          </div>
          {company && (
            <p>
              Émetteur serveur : {company.name}. Les autres émetteurs doivent
              être ouverts dans un nouveau document ; la saisie courante n’est
              jamais déplacée automatiquement.
            </p>
          )}
        </>
      )}
    </section>
  );
}
