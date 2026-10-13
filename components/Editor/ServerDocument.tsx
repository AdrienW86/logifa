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
import { documentInput } from "@/lib/workspace/input";
import { SendDocument } from "../Workspace/Mail";

export default function ServerDocument({
  draft,
  userId,
  onLoad,
  onCompany,
  onLock,
}: {
  draft: EditorDraft;
  userId?: string;
  onLoad: (draft: EditorDraft, saved?: boolean) => void;
  onCompany: (company: Company) => void;
  onLock: (locked: boolean) => void;
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
  const [savedVersion, setSavedVersion] = useState("");
  const [clientKind, setClientKind] = useState("");
  const [clientSearch, setClientSearch] = useState("");
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
        };
        setCompany(mapped);
        onCompany(mapped);
        setClients(workspace.lists.clients.filter((row) => !row.archived_at));
        setProjects(workspace.lists.projects);
        setDocs([...workspace.lists.quotes, ...workspace.lists.invoices]);
        setAvailable(true);
        setMessage(
          "Connexion serveur disponible. Un brouillon n’a aucun numéro définitif.",
        );
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
  const save = async () => {
    if (
      !confirm(
        "Enregistrer ce brouillon sur le serveur avec les données du formulaire ? Aucun numéro ne sera attribué.",
      )
    )
      return;
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
    setMessage("Brouillon sauvegardé sur le serveur.");
  };
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
                      if (
                        !isRecord(detail.row) ||
                        detail.row.client_id !== client ||
                        !isRecord(detail.draft) ||
                        !isDraftShape(detail.draft.payload)
                      )
                        throw new Error(
                          "Source reeditable indisponible ou client different.",
                        );
                      const sourceDraft = detail.draft.payload;
                      const lines =
                        kind === "final"
                          ? sourceDraft.lines
                          : depositProposal(
                              documentInput({
                                issuer_profile_id: issuer,
                                client_id: client,
                                lines: sourceDraft.lines,
                              }).lines,
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
            <button
              type="button"
              disabled={busy || locked || !client}
              onClick={safe(save)}
            >
              Sauvegarder le brouillon serveur
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
                setMessage(
                  "Émission confirmée. Conservez maintenant le PDF original dans la bibliothèque.",
                );
              })}
            >
              Émettre la version sauvegardée
            </button>
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
