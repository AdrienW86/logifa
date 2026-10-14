"use client";
import { isRecord } from "../../lib/editor/contracts";
import { financialMetrics } from "@/lib/workspace/metrics";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  command,
  parseWorkspace,
  selectedIssuer,
  selectIssuer,
  value,
  type Row,
  type WorkspaceData,
} from "@/lib/workspace/client";
import { companies } from "@/app/company";
import s from "./workspace.module.css";
import { MailSettings, SendDocument } from "./Mail";

export type Section =
  | "dashboard"
  | "espace"
  | "entreprises"
  | "clients"
  | "devis"
  | "factures"
  | "paiements"
  | "documents"
  | "parametres";
const titles: Record<Section, string> = {
  dashboard: "Votre activité",
  espace: "Espace entreprise",
  entreprises: "Entreprises émettrices",
  clients: "Carnet de clients",
  devis: "Vos devis",
  factures: "Vos factures",
  paiements: "Règlements",
  documents: "Bibliothèque documentaire",
  parametres: "Paramètres",
};
const money = (minor: unknown) => {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(Number(BigInt(String(minor ?? 0))) / 100);
  } catch {
    return "Indisponible";
  }
};
const textError = (error: unknown) =>
  error instanceof Error ? error.message : "Opération impossible.";
export default function Workspace({ section }: { section: Section }) {
  const router = useRouter();
  const { user } = useUser(),
    [data, setData] = useState<WorkspaceData | null>(null),
    [issuer, setIssuer] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [form, setForm] = useState<string | null>(null),
    [editing, setEditing] = useState<Row>({}),
    [identityPreview, setIdentityPreview] = useState<Row>({}),
    [key, setKey] = useState(""),
    [clientFilter, setClientFilter] = useState("");
  const [clientQuickSearch, setClientQuickSearch] = useState("");
  const activeIssuer = useRef("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const [knownIssuers, setKnownIssuers] = useState<Row[]>([]);
  const [settingsTab, setSettingsTab] = useState<"documents" | "mail" | "technical">("documents");
  const loadSequence = useRef(0);
  const load = useCallback(async (id: string) => {
    if (activeIssuer.current !== id) return;
    const sequence = ++loadSequence.current;
    // Keep the current workspace mounted while refreshing data.
    try {
      const next = parseWorkspace(
        await api(`/api/workspace?issuer=${encodeURIComponent(id)}`),
      );
      if (sequence !== loadSequence.current || activeIssuer.current !== id)
        return;
      setData(next);
      setKnownIssuers(next.lists.issuer_profiles.filter((row) => !(isRecord(row.metadata) && row.metadata.legacy_hidden === true)));
      setError("");
    } catch (e) {
      if (sequence === loadSequence.current && activeIssuer.current === id)
        setError(textError(e));
    }
  }, []);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const sync = () => {
      const id = selectedIssuer(userId);
      const changed = activeIssuer.current !== id;
      activeIssuer.current = id;
      setIssuer(id);
      setSearch("");
      setClientFilter("");
      if (changed) setForm(null);
      void load(id);
    };
    sync();
    window.addEventListener("logifa:issuer", sync);
    return () => {
      loadSequence.current++;
      window.removeEventListener("logifa:issuer", sync);
    };
  }, [userId, load]);
  const mutate = async (action: string, payload: Row, question: string) => {
    if (busy || !window.confirm(question)) return;
    setBusy(true);
    setError("");
    try {
      const result = await command(action, payload, true);
      setMessage(
        action === "recover-archives"
          ? `Archives reprises : ${value(result, "recovered")} · Fichiers manquants : ${value(result, "missing")} · Reprises refusées : ${value(result, "rejected")}`
          : "Opération enregistrée sur le serveur.",
      );
      await load(issuer);
    } catch (e) {
      setError(textError(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (type: string, row: Row = {}) => {
    setError("");
    setForm(type);
    setEditing(row);
    setIdentityPreview(row);
    setKey(crypto.randomUUID());
  };
  useEffect(() => {
    if (form) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [form]);
  const clients = data?.lists.clients ?? [],
    invoices = data?.lists.invoices ?? [],
    quotes = data?.lists.quotes ?? [],
    payments = data?.lists.payments ?? [],
    issuers = knownIssuers,
    entities = data?.lists.legal_entities ?? [];
  const testIssuers = issuers.filter((row) => /^RECETTE TECHNIQUE/i.test(value(row, "commercial_name")));
  const businessRows = issuers.filter((row) => !/^RECETTE TECHNIQUE/i.test(value(row, "commercial_name")));
  const metrics = financialMetrics(invoices, payments, data?.balances ?? {});
  const chosenClient = clients.find((row) => row.id === clientFilter);
  const clientMetrics = financialMetrics(
    invoices.filter((row) => row.client_id === clientFilter),
    payments.filter((row) => row.client_id === clientFilter),
    data?.balances ?? {},
  );
  const label = (id: unknown) =>
    clients.find((c) => c.id === id)?.company_name ?? "Client non renseigné";
  const docLink = (row: Row, kind: "quote" | "invoice") =>
    `/${kind === "quote" ? "devis" : "facture"}?document=${value(row, "id")}&issuer=${issuer}`;
  const rows =
    section === "clients"
      ? clients
      : section === "devis"
        ? quotes
        : section === "factures"
          ? invoices
          : section === "paiements"
            ? payments
            : section === "documents"
              ? (data?.lists.document_files ?? [])
              : issuers;
  const workflows = data?.lists.document_workflow ?? [];
  const workflow = (row: Row) =>
    workflows.find((w) => w.quote_id === row.id || w.invoice_id === row.id);
  const visible = rows.filter(
    (row) =>
      (!clientFilter ||
        row.client_id === clientFilter ||
        row.id === clientFilter) &&
      [...Object.values(row), workflow(row)?.state]
        .filter((v) => typeof v === "string")
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const fd = new FormData(event.currentTarget),
      payload: Row = {};
    for (const [name, v] of fd)
      if (typeof v === "string" && v !== "") payload[name] = v;
    if (form === "legal") {
      payload.reviewed = fd.get("reviewed") === "on";
      for (const field of [
        "insurance",
        "legal_mentions",
        "address",
        "contacts",
      ]) {
        try {
          payload[field] = JSON.parse(
            String(
              fd.get(field) || (["insurance"].includes(field) ? "[]" : "{}"),
            ),
          );
        } catch {
          setError(`JSON invalide : ${field}`);
          return;
        }
      }
    }
    if (form === "legal") {
      const mentions = payload.legal_mentions;
      if (mentions && typeof mentions === "object" && !Array.isArray(mentions))
        payload.legal_mentions = {
          ...mentions,
          payment_terms: String(fd.get("payment_terms") ?? ""),
          pdf_footer: String(fd.get("pdf_footer") ?? ""),
          manager: String(fd.get("manager") ?? ""),
          insurance_label: String(fd.get("insurance_label") ?? ""),
        };
      for (const key of [
        "payment_terms",
        "pdf_footer",
        "manager",
        "insurance_label",
      ])
        delete payload[key];
    }
    if (form === "client") {
      try {
        payload.addresses = JSON.parse(String(fd.get("addresses") || "[]"));
      } catch {
        setError("Adresses complémentaires : JSON invalide.");
        return;
      }
    }
    if (form === "issuer") {
      const rate = String(fd.get("company_vat_rate") ?? "");
      if (!["", "0", "5.5", "10", "20"].includes(rate)) { setError("Taux de TVA invalide."); return; }
      if (!String(fd.get("source_siret") ?? "").trim()) { setError("SIRET requis."); return; }
    }
    payload.issuer_id = issuer;
    if (editing.id) payload.id = editing.id;
    payload.key = key;
    if (
      form === "payment" ||
      form === "allocate" ||
      form === "refund" ||
      form === "apply-credit"
    ) {
      const amount = String(payload.amount ?? "").replace(",", ".");
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
        setError("Montant positif avec deux décimales maximum.");
        return;
      }
      const [euros, cents = ""] = amount.split(".");
      payload.amount_minor = (
        BigInt(euros) * 100n +
        BigInt(cents.padEnd(2, "0"))
      ).toString();
      delete payload.amount;
    }
    if (
      !window.confirm(
        "Confirmer cet enregistrement serveur ? Les opérations financières seront tracées.",
      )
    )
      return;
    setBusy(true);
    try {
      if (form === "issuer") {
        const associated = entities.find((entity) => entity.id === editing.legal_entity_id);
        const fiscal: Row = {
          ...(associated ?? {}),
          issuer_id: issuer, key,
          legal_name: String(fd.get("commercial_name") ?? "").trim(),
          siret: String(fd.get("source_siret") ?? "").trim(),
          vat_number: String(fd.get("company_vat_number") ?? "").trim(),
          vat_regime: String(fd.get("company_vat_regime") ?? "unknown"),
          vat_exigibility: value(associated ?? {}, "vat_exigibility") || "unknown",
          default_vat_rate: String(fd.get("company_vat_rate") ?? ""),
          reviewed: false,
        };
        if (associated?.id) fiscal.id = associated.id;
        const result = await command("legal", fiscal, true);
        if (typeof result.id !== "string" || !result.id) throw new Error("Identité fiscale non sauvegardée.");
        payload.legal_entity_id = result.id;
        delete payload.company_vat_regime;
        delete payload.company_vat_rate;
        delete payload.company_vat_number;
      }
      await command(form ?? "", payload, true);
      setForm(null);
      setMessage("Enregistrement serveur confirmé.");
      await load(issuer);
    } catch (e) {
      setError(textError(e));
    } finally {
      setBusy(false);
    }
  };
  const field = (
    name: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label key={name === "logo_path" ? value(editing, name) : name}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value(editing, name)}
        required={required}
      />
    </label>
  );
  const select = (
    name: string,
    label: string,
    options: [string, string][],
    required = true,
  ) => (
    <label key={name}>
      {label}
      <select
        aria-label={label}
        name={name}
        defaultValue={value(editing, name)}
        required={required}
      >
        <option value="">Choisir</option>
        {options.map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <main className={s.shell}>
      <p>LOGIFA · Espace privé</p>
      <h1>{titles[section]}</h1>

      {section === "entreprises" ? (
        <nav className={s.leanNav} aria-label="Navigation principale">
          <span>Mes entreprises</span>
        </nav>
      ) : (
        <>
          <div className={s.companyBar}>
            <Link href="/gestion/entreprises">← Mes entreprises</Link>
            <strong>{issuers.find((row) => value(row,"id") === issuer)?.commercial_name?.toString() || "Aucune entreprise ouverte"}</strong>
          </div>
          {issuer && (
            <nav className={s.leanNav} aria-label="Navigation de l'entreprise">
              {(["espace","clients","devis","factures","documents","parametres","paiements"] as const).map((key) => (
                <Link key={key} href={`/gestion/${key}`} aria-current={section === key ? "page" : undefined}>
                  {key === "espace" ? "Vue d’ensemble" : key === "documents" ? "Archives" : key === "parametres" ? "Modèles et réglages" : titles[key]}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
      {error && (
        <p role="alert" className={s.notice}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={s.notice}>
          {message}
        </p>
      )}
      {!data && (
        <div className={s.notice}>
          <p>
            Les données serveur ne sont pas chargées. Aucun chiffre fictif ni
            sauvegarde distante ne sont présentés.
          </p>
          <p>Les éditeurs restent utilisables sur cet appareil.</p>
          <div className={s.actions}>
            <Link href="/devis">Ouvrir un devis local</Link>
            <Link href="/facture">Ouvrir une facture locale</Link>
          </div>
        </div>
      )}
      {section === "parametres" && (
        <section className={s.preferences}>
          <p className={s.intro}>Choisissez ce que vous voulez configurer. Les réglages techniques restent séparés des documents.</p>
          <div className={s.settingsTabs} role="group" aria-label="Catégorie de paramètres">
            <button type="button" aria-pressed={settingsTab === "documents"} onClick={() => setSettingsTab("documents")}>Documents et modèles</button>
            <button type="button" aria-pressed={settingsTab === "mail"} onClick={() => setSettingsTab("mail")}>Envoi par e-mail</button>
            <button type="button" aria-pressed={settingsTab === "technical"} onClick={() => setSettingsTab("technical")}>Connexions et fiscalité</button>
          </div>
          {settingsTab === "documents" && (
            <div className={s.settingsGrid}>
              <Link className={s.settingTile} href="/devis"><strong>Modèle de devis</strong><span>Éditeur et modèle PDF existants</span></Link>
              <Link className={s.settingTile} href="/facture"><strong>Modèle de facture</strong><span>Éditeur et modèle PDF existants</span></Link>
              <Link className={s.settingTile} href="/gestion/documents"><strong>Archives</strong><span>PDF et documents conservés</span></Link>
            </div>
          )}
          {settingsTab === "mail" && <MailSettings key={issuer} issuer={issuer} />}
          {settingsTab === "technical" && (
            <div className={s.settingsGrid}>
              <Link className={s.settingTile} href="/gestion/entreprises"><strong>Entreprises et TVA</strong><span>Profils émetteurs, entités juridiques et paramètres fiscaux</span></Link>
              <div className={s.settingTile}><strong>Clés API et sécurité</strong><span>Les secrets sont gérés côté serveur dans les variables d’environnement, jamais affichés ici.</span></div>
              <div className={s.settingTile}><strong>Connexion serveur</strong><span>{data ? "Données serveur disponibles" : "Connexion aux données non validée"}</span></div>
            </div>
          )}
        </section>
      )}
      {data && section === "dashboard" && (
        <>
          <h2>
            {issuer
              ? "Situation de l’émetteur sélectionné"
              : "Sélectionnez un émetteur"}
          </h2>
          {data.truncated.length > 0 && (
            <p className={s.notice}>
              Vue limitée aux 500 premières fiches : métriques partielles, non
              utilisables comme total comptable.
            </p>
          )}
          <div className={s.grid}>
            {[
              ["Devis", String(quotes.length)],
              [
                "Devis en attente",
                String(quotes.filter((q) => q.status === "sent").length),
              ],
              [
                "Factures émises",
                String(invoices.filter((i) => i.lifecycle !== "draft").length),
              ],
              ["Total facturé net des avoirs", money(metrics.billed)],
              ["Factures impayées", String(metrics.unpaid)],
              ["Obligations restant dues", money(metrics.remaining)],
              ["Encaissements nets", money(metrics.received)],
            ].map(([title, total]) => (
              <article key={title} className={s.card}>
                {title}
                <strong>{total}</strong>
              </article>
            ))}
          </div>
          <p>
            Les factures de solde incluent des déductions fiscales : ne pas
            additionner leurs montants bruts avec les acomptes.
          </p>
        </>
      )}
      {data &&
        ["clients", "devis", "factures", "paiements", "documents"].includes(
          section,
        ) && (
          <>
            <div className={s.actions} style={{ marginTop: 20 }}>
              <input
                aria-label="Rechercher dans les données"
                placeholder="Rechercher"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {section !== "clients" && clients.length > 0 && (
                <div className={s.clientChooser}>
                  <label htmlFor="client-quick-search">Rechercher un client</label>
                  <input
                    id="client-quick-search"
                    value={clientQuickSearch}
                    onChange={(event) => setClientQuickSearch(event.target.value)}
                    placeholder="Nom, entreprise, téléphone ou e-mail"
                    autoComplete="off"
                  />
                  <div className={s.clientChoices}>
                    <button type="button" aria-pressed={!clientFilter} onClick={() => setClientFilter("")}>Tous les clients</button>
                    {clients
                      .filter((row) => [value(row, "company_name"), value(row, "contact_email"), value(row, "phone")].join(" ").toLocaleLowerCase("fr").includes(clientQuickSearch.toLocaleLowerCase("fr")))
                      .slice(0, 12)
                      .map((row) => (
                        <button type="button" key={value(row, "id")} aria-pressed={clientFilter === row.id} onClick={() => setClientFilter(value(row, "id"))}>
                          {value(row, "company_name")}
                        </button>
                      ))}
                  </div>
                  {clients.length > 12 && !clientQuickSearch && <small>Saisissez quelques lettres pour affiner la liste.</small>}
                </div>
              )}
              {section === "clients" && (
                <button disabled={!issuer} onClick={() => open("client")}>
                  Nouveau client
                </button>
              )}
              {section === "devis" && (
                <Link href={`/devis?issuer=${issuer}`}>Nouveau devis</Link>
              )}
              {section === "factures" && (
                <Link href={`/facture?issuer=${issuer}`}>Nouvelle facture</Link>
              )}
              {section === "paiements" && (
                <>
                  <button disabled={!issuer} onClick={() => open("payment")}>
                    Enregistrer un règlement / acompte reçu
                  </button>
                  <button disabled={!issuer} onClick={() => open("allocate")}>
                    Affecter un règlement
                  </button>
                  <button disabled={!issuer} onClick={() => open("refund")}>
                    Rembourser
                  </button>
                  <button
                    disabled={!issuer}
                    onClick={() => open("apply-credit")}
                  >
                    Imputer un avoir
                  </button>
                </>
              )}
              {section === "documents" &&
                (data.archiveRecovery ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        "recover-archives",
                        {},
                        "Reprendre les archivages interrompus ? Les fichiers seront vérifiés sans écrasement ; les conditions d’acquittement restent obligatoires.",
                      )
                    }
                  >
                    Reprendre les archivages interrompus
                  </button>
                ) : null)}
              {section === "documents" && (
                <ImportDocument
                  issuer={issuer}
                  clients={clients}
                  documents={[...quotes, ...invoices]}
                  refresh={() => load(issuer)}
                  setError={setError}
                />
              )}
            </div>
            {!issuer && (
              <p className={s.notice}>
                Choisissez une entreprise pour accéder à son carnet.
              </p>
            )}
            {section === "clients" && (
              <section className={s.clientArea} aria-label="Carnet de clients">
                {chosenClient ? (
                  <div className={s.clientDetail}>
                    <button type="button" onClick={() => setClientFilter("")}>← Tous les clients</button>
                    <div className={s.detailHeader}>
                      <div>
                        <p>Fiche client</p>
                        <h2>{value(chosenClient, "company_name")}</h2>
                        <p>{value(chosenClient, "contact_email")} · {value(chosenClient, "phone")}</p>
                        <p>{value(chosenClient, "billing_address")}</p>
                      </div>
                      <div className={s.actions}>
                        <button onClick={() => open("client", chosenClient)}>Modifier</button>
                        <button onClick={() => open("project", { client_id: chosenClient.id })}>Ajouter un chantier</button>
                        {!chosenClient.archived_at ? (
                          <button disabled={busy} onClick={() => void mutate("archive-client", { issuer_id: issuer, id: chosenClient.id }, "Archiver ce client et conserver tous ses documents ?")}>Archiver</button>
                        ) : (
                          <>
                            <button disabled={busy} onClick={() => void mutate("reactivate-client", { issuer_id: issuer, id: chosenClient.id }, "Réactiver ce client ?")}>Réactiver</button>
                            {data.clientLifecycle && <button disabled={busy} onClick={() => void mutate("delete-client", { issuer_id: issuer, id: chosenClient.id, confirmation: "SUPPRIMER" }, "Supprimer définitivement ce client archivé ? Ses documents, chantiers ou règlements bloqueront la suppression.")}>Supprimer définitivement</button>}
                          </>
                        )}
                      </div>
                    </div>
                    <div className={s.grid}>
                      <article className={s.card}><h3>Devis</h3><strong>{quotes.filter((r) => r.client_id === clientFilter).length}</strong><Link href={`/devis?issuer=${issuer}`}>Créer un devis</Link>
                        <ul>{quotes.filter((r) => r.client_id === clientFilter).map((r) => <li key={value(r, "id")}><Link href={docLink(r, "quote")}>{value(r, "quote_number") || "Devis brouillon"}</Link> · {value(r, "lifecycle") || "Brouillon"}</li>)}</ul>
                      </article>
                      <article className={s.card}><h3>Factures</h3><strong>{invoices.filter((r) => r.client_id === clientFilter).length}</strong><Link href={`/facture?issuer=${issuer}`}>Créer une facture</Link>
                        <ul>{invoices.filter((r) => r.client_id === clientFilter).map((r) => <li key={value(r, "id")}><Link href={docLink(r, "invoice")}>{value(r, "invoice_number") || "Facture brouillon"}</Link> · {value(r, "lifecycle") || "Brouillon"}</li>)}</ul>
                      </article>
                      <article className={s.card}><h3>Situation financière</h3><p>Facturé : {money(clientMetrics.billed)}</p><p>Encaissé : {money(clientMetrics.received)}</p><p>Reste dû : {money(clientMetrics.remaining)}</p></article>
                    </div>
                  </div>
                ) : (
                  <div className={s.clientList}>
                    <p>{visible.length} client(s) dans cet émetteur. Sélectionnez une fiche pour ses devis et factures.</p>
                    {visible.map((row) => (
                      <article className={s.clientRow} key={value(row, "id")}>
                        <button type="button" className={s.clientOpen} onClick={() => {setClientFilter(value(row, "id"));setSearch("");}}>
                          <strong>{value(row, "company_name")}</strong>
                          <span>{value(row, "contact_email") || value(row, "phone") || "Coordonnées à compléter"}</span>
                          <span>{row.archived_at ? "Archivé" : "Actif"} · {quotes.filter((q) => q.client_id === row.id).length} devis · {invoices.filter((i) => i.client_id === row.id).length} factures</span>
                        </button>
                        <button onClick={() => open("client", row)}>Modifier</button>
                      </article>
                    ))}
                    {!visible.length && <p>Aucun client dans cette sélection.</p>}
                  </div>
                )}
              </section>
            )}
            {section !== "clients" && (
            <div className={s.table}>
              <table>
                <thead>
                  <tr>
                    <th>Référence / nom</th>
                    <th>Client / identité</th>
                    <th>Situation</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={value(row, "id")}>
                      <td>
                        {value(row, "company_name") ||
                          value(row, "quote_number") ||
                          value(row, "invoice_number") ||
                          value(row, "original_filename") ||
                          value(row, "received_on") ||
                          "Brouillon sans numéro"}
                      </td>
                      <td>
                        {String(label(row.client_id))}
                      </td>
                      <td>
                        {(workflow(row)
                          ? value(workflow(row) ?? {}, "state")
                          : "") ||
                          value(row, "lifecycle") ||
                          value(row, "role") ||
                          value(row, "direction") ||
                          (row.archived_at ? "Archivé" : "Actif")}
                        {section === "paiements" &&
                          ` · ${money(row.amount_minor)}`}
                        {section === "factures" &&
                          data.balances[value(row, "id")] && (
                            <p>
                              Reste :{" "}
                              {money(
                                data.balances[value(row, "id")].remaining_minor,
                              )}{" "}
                              ·{" "}
                              {data.balances[value(row, "id")]
                                .is_acquittable === true
                                ? "Acquittement autorisé"
                                : "Acquittement non autorisé"}
                            </p>
                          )}
                      </td>
                      <td>
                        <div className={s.actions}>
                          {(section === "devis" || section === "factures") && (
                            <>
                              {row.lifecycle !== "draft" && (
                                <SendDocument
                                  issuer={issuer}
                                  documentId={value(row, "id")}
                                  kind={
                                    section === "devis" ? "quote" : "invoice"
                                  }
                                  recipient={
                                    isRecord(row.client_snapshot)
                                      ? value(
                                          row.client_snapshot,
                                          "contact_email",
                                        )
                                      : ""
                                  }
                                />
                              )}
                              {section === "factures" && row.lifecycle === "issued" &&
                                data.balances[value(row, "id")]?.is_acquittable === true && (
                                <a
                                  href={`/api/invoices/${value(row, "id")}/pdf?issuer=${encodeURIComponent(issuer)}&paid=1`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Télécharger la facture acquittée
                                </a>
                              )}
                              <Link
                                href={docLink(
                                  row,
                                  section === "devis" ? "quote" : "invoice",
                                )}
                              >
                                {row.lifecycle === "draft"
                                  ? "Réouvrir"
                                  : "Consulter"}
                              </Link>
                              <Link
                                href={`${docLink(row, section === "devis" ? "quote" : "invoice")}&duplicate=1`}
                              >
                                Dupliquer
                              </Link>
                              <button
                                onClick={() =>
                                  void mutate(
                                    "workflow",
                                    {
                                      issuer_id: issuer,
                                      id: row.id,
                                      kind:
                                        section === "devis"
                                          ? "quote"
                                          : "invoice",
                                      state: "archived",
                                      reason:
                                        "Archivage demandé par administrateur",
                                    },
                                    "Archiver sans supprimer l’original ?",
                                  )
                                }
                              >
                                Archiver
                              </button>
                            </>
                          )}
                          {section === "devis" && (
                            <>
                              <button
                                disabled={busy || row.lifecycle !== "draft"}
                                onClick={() =>
                                  void mutate(
                                    "delete-draft",
                                    {
                                      issuer_id: issuer,
                                      id: row.id,
                                      kind: "quote",
                                      confirmation: "SUPPRIMER",
                                    },
                                    "Supprimer définitivement ce brouillon ? Tout lien financier, signature ou fichier bloque la suppression.",
                                  )
                                }
                              >
                                Supprimer le brouillon
                              </button>
                              {["sent", "accepted", "declined", "expired"].map(
                                (state) => (
                                  <button
                                    key={state}
                                    disabled={
                                      busy || row.lifecycle !== "issued"
                                    }
                                    onClick={() =>
                                      void mutate(
                                        "workflow",
                                        {
                                          issuer_id: issuer,
                                          id: row.id,
                                          kind: "quote",
                                          state,
                                          reason:
                                            "Décision explicite administrateur",
                                        },
                                        `Confirmer le statut ${state} ? Aucun courriel ne sera envoyé.`,
                                      )
                                    }
                                  >
                                    {
                                      {
                                        sent: "Marquer envoyé",
                                        accepted: "Accepté",
                                        declined: "Refusé",
                                        expired: "Expiré",
                                      }[state]
                                    }
                                  </button>
                                ),
                              )}
                            </>
                          )}
                          {section === "documents" && (
                            <a
                              href={`/api/documents/${value(row, "id")}?issuer=${issuer}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Télécharger avec vérification SHA-256
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p>Aucune fiche dans cette sélection.</p>}
            </div>
            )}
          </>
        )}
      {data && section === "entreprises" && (
        <section className={s.businessArea}>
          <div className={s.businessHeadline}>
            <div>
              <h2>Entreprises</h2>
              <p>Choisissez une entreprise pour ouvrir son espace. Chaque entreprise possède ses propres clients et documents.</p>
            </div>
            <button disabled={busy} onClick={() => open("issuer")}>+ Ajouter une entreprise</button>
          </div>
          {businessRows.filter((row) => row.active !== false).length === 0 && (
            <div className={s.card}>
              <h3>Votre espace est prêt</h3>
              <p>Ajoutez votre première entreprise émettrice, puis ses clients et ses documents.</p>
              <button disabled={busy} onClick={() => open("issuer")}>Créer ma première entreprise</button>
            </div>
          )}
          <div className={s.businessCards}>
            {businessRows.filter((row) => row.active !== false).map((row) => (
              <article className={s.card} key={value(row, "id")}>
                <button className={s.enterpriseOpen} onClick={() => {if (user) { selectIssuer(user.id,value(row,"id")); router.push("/gestion/espace"); }}}>
                  <span className={s.enterpriseSymbol}>{value(row,"commercial_name").slice(0,1).toUpperCase()}</span>
                  <strong>{value(row,"commercial_name")}</strong>
                  <small>{value(row,"city_zip") || value(row,"address") || "Coordonnées à compléter"}</small>
                  <span>Ouvrir l’espace entreprise →</span>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {section === "espace" && (
        <section className={s.businessArea}>
          {!issuer ? (
            <div className={s.card}>
              <h2>Choisissez une entreprise</h2>
              <p>Les clients et documents sont accessibles depuis son espace.</p>
              <Link href="/gestion/entreprises">Voir mes entreprises →</Link>
            </div>
          ) : (
            <>
              <div className={s.businessHeadline}>
                <div><h2>{issuers.find((row) => value(row,"id") === issuer)?.commercial_name?.toString() || "Entreprise"}</h2>
                  <p>Clients, documents et informations de cette entreprise uniquement.</p></div>
                <button onClick={() => open("issuer",issuers.find((row) => row.id === issuer) ?? {})}>Modifier l’entreprise</button>
              </div>
              <div className={s.companyHomeGrid}>
                <Link href="/gestion/clients"><strong>Clients</strong><span>{clients.length} fiche(s) · Ajouter ou retrouver un client →</span></Link>
                <Link href="/gestion/devis"><strong>Devis</strong><span>{quotes.length} document(s) · Créer et consulter →</span></Link>
                <Link href="/gestion/factures"><strong>Factures</strong><span>{invoices.length} document(s) · Créer et consulter →</span></Link>
                <Link href="/gestion/documents"><strong>Documents historiques</strong><span>Importer les anciens devis et factures →</span></Link>
                <Link href="/gestion/parametres"><strong>Modèles et réglages</strong><span>Modèles PDF, e-mail et préférences →</span></Link>
                <button type="button" onClick={() => open("legal",entities.find((row) => row.id === issuers.find((item) => item.id === issuer)?.legal_entity_id) ?? {})}><strong>Identité et TVA</strong><span>SIRET, numéro TVA et taux applicable →</span></button>
              </div>
            </>
          )}
        </section>
      )}
      {chosenClient && section !== "clients" && (
        <section className={s.card}>
          <h2>Situation de {value(chosenClient, "company_name")}</h2>
          <p>
            Facturé : {money(clientMetrics.billed)} · Encaissé net :{" "}
            {money(clientMetrics.received)} · Reste dû :{" "}
            {money(clientMetrics.remaining)}
          </p>
          <p>
            Devis :{" "}
            {quotes.filter((row) => row.client_id === clientFilter).length} ·
            Factures :{" "}
            {invoices.filter((row) => row.client_id === clientFilter).length} ·
            Mouvements :{" "}
            {payments.filter((row) => row.client_id === clientFilter).length}
          </p>
          <div className={s.actions}>
            {quotes
              .filter((row) => row.client_id === clientFilter)
              .map((row) => (
                <Link key={value(row, "id")} href={docLink(row, "quote")}>
                  {value(row, "quote_number") || "Devis brouillon"}
                </Link>
              ))}
            {invoices
              .filter((row) => row.client_id === clientFilter)
              .map((row) => (
                <Link key={value(row, "id")} href={docLink(row, "invoice")}>
                  {value(row, "invoice_number") || "Facture brouillon"}
                </Link>
              ))}
          </div>
          <p>
            Les PDF originaux et justificatifs sont accessibles dans la
            bibliothèque en filtrant par client.
          </p>
        </section>
      )}
      {data && ["devis", "factures", "paiements"].includes(section) && (
        <details className={s.card}>
          <summary>Historique des actions de cet émetteur</summary>
          <ul>
            {(data.lists.document_events ?? []).map((event) => (
              <li key={value(event, "id")}>
                {value(event, "occurred_at")} · {value(event, "event_type")} ·{" "}
                {value(event, "table_name")} · {value(event, "record_id")}
              </li>
            ))}
          </ul>
        </details>
      )}
      {form && (
        <form
          ref={formRef}
          className={s.form}
          onSubmit={submit}
          onInput={(event) => {
            if (form === "issuer") {
              const fields: Row = {};
              for (const [key, val] of new FormData(event.currentTarget))
                if (typeof val === "string") fields[key] = val;
              setIdentityPreview(fields);
            }
          }}
        >
          <div className={s.formHeading}><div><p>Gestion / {form === "client" ? "Clients" : form === "issuer" ? "Entreprises" : form === "legal" ? "Fiscalité" : "Opérations"}</p><h2>{editing.id ? "Modifier" : "Créer"} · {form === "client" ? "fiche client" : form === "issuer" ? "entreprise" : form === "legal" ? "entité juridique" : form}</h2></div><button type="button" onClick={() => setForm(null)}>Fermer ✕</button></div>
          {form === "issuer" && (
            <article
              className={`${s.card} ${s.wide}`}
              style={{
                borderColor: /^#[a-fA-F0-9]{6}$/.test(
                  value(identityPreview, "color"),
                )
                  ? value(identityPreview, "color")
                  : undefined,
              }}
            >
              <h3>Prévisualisation de l’identité</h3>
              {/^\/[a-zA-Z0-9_-]+\.png$|^data:image\/png;base64,/.test(
                value(identityPreview, "logo_path"),
              ) && (
                <img
                  src={value(identityPreview, "logo_path")}
                  alt="Nouveau logo de l’émetteur"
                  style={{ width: 90, height: 90, objectFit: "contain" }}
                />
              )}
              <p
                style={{
                  color: /^#[a-fA-F0-9]{6}$/.test(
                    value(identityPreview, "color"),
                  )
                    ? value(identityPreview, "color")
                    : undefined,
                }}
              >
                {value(identityPreview, "commercial_name")}
              </p>
              <p>
                {value(identityPreview, "address")} ·{" "}
                {value(identityPreview, "city_zip")}
              </p>
              <p>
                Cette prévisualisation concerne l’identité. Relisez le PDF
                produit avant de l’émettre ; les historiques déjà émis
                conservent leur instantané.
              </p>
            </article>
          )}
          {form === "issuer" && (
            <>
              {field("commercial_name", "Nom commercial", "text", true)}
              {select(
                "legal_entity_id",
                "Entité juridique",
                entities.map((row) => [
                  value(row, "id"),
                  value(row, "legal_name"),
                ]),
                false,
              )}
              {field("address", "Adresse")}
              {field("city_zip", "Code postal et ville")}
              {field("phone", "Téléphone")}
              {field("email", "Email", "email")}
              {field("website", "Site Internet", "url")}
              {field("source_siret", "SIRET de l’entreprise", "text", true)}
              <div className={s.wide}>
                <h3>TVA de l’entreprise émettrice</h3>
                <p>Enregistrée sur son identité juridique. Le taux effectif reste vérifié sur les lignes du devis ou de la facture.</p>
              </div>
              <label>Régime TVA
                <select name="company_vat_regime" defaultValue={value(entities.find((entity) => entity.id === editing.legal_entity_id) ?? {}, "vat_regime") || "unknown"}>
                  <option value="unknown">À préciser</option><option value="standard">TVA normale</option><option value="exempt">Franchise ou exonération</option><option value="reverse_charge">Autoliquidation</option>
                </select>
              </label>
              <label>Taux de TVA habituel
                <select name="company_vat_rate" defaultValue={value(entities.find((entity) => entity.id === editing.legal_entity_id) ?? {}, "default_vat_rate")}>
                  <option value="">À préciser</option><option value="0">0 %</option><option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option>
                </select>
              </label>
              <label>Numéro de TVA intracommunautaire
                <input name="company_vat_number" defaultValue={value(entities.find((entity) => entity.id === editing.legal_entity_id) ?? {}, "vat_number")} placeholder="FR…" />
              </label>
              {field("color", "Couleur PDF", "color")}
              {field(
                "logo_path",
                "Logo : chemin public existant ou PNG data URL",
              )}
              <label>
                Charger un nouveau logo PNG
                <input
                  type="file"
                  accept="image/png"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 500000) {
                      setError("Logo limité à 500 Ko.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string")
                        setEditing((current) => ({
                          ...current,
                          logo_path: reader.result,
                        }));
                      setIdentityPreview((current) => ({
                        ...current,
                        logo_path: reader.result,
                      }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <p className={s.wide}>
                Les logos existants ne sont pas modifiés. Un nouveau logo est
                conservé dans le profil privé ; contrôlez-le dans le PDF avant
                émission.
              </p>
            </>
          )}
          {form === "legal" && (
            <>
              {field("legal_name", "Dénomination juridique", "text", true)}
              {field("siret", "SIRET", "text", true)}
              {field("siren", "SIREN")}
              {field("legal_status", "Forme juridique")}
              {select("vat_regime", "Régime TVA", [
                ["unknown", "À qualifier"],
                ["standard", "TVA normale"],
                ["exempt", "Exonéré"],
                ["reverse_charge", "Autoliquidation"],
              ])}
              {select("vat_exigibility", "Exigibilité", [
                ["unknown", "À qualifier"],
                ["cash", "Encaissements"],
                ["debits", "Débits"],
                ["delivery", "Livraison"],
              ])}
              {field("default_vat_rate", "Taux TVA par défaut")}
              {field("vat_number", "Numéro TVA")}
              {field("iban", "IBAN")}
              {field("bic", "BIC")}
              {field("bank_name", "Banque")}
              {field("quote_prefix", "Préfixe des devis")}
              {field("invoice_prefix", "Préfixe des factures")}
              {[
                "payment_terms",
                "pdf_footer",
                "manager",
                "insurance_label",
              ].map((name) => (
                <label key={name}>
                  {
                    {
                      payment_terms: "Conditions de paiement",
                      pdf_footer: "Mentions légales et fiscales à imprimer",
                      manager: "Dirigeant (si applicable)",
                      insurance_label: "Assurance / décennale à imprimer",
                    }[name]
                  }
                  <textarea
                    name={name}
                    defaultValue={value(
                      isRecord(editing.legal_mentions)
                        ? editing.legal_mentions
                        : {},
                      name,
                    )}
                  />
                </label>
              ))}
              {["address", "contacts", "insurance", "legal_mentions"].map(
                (name) => (
                  <label key={name}>
                    {name} (JSON)
                    {
                      <textarea
                        name={name}
                        defaultValue={JSON.stringify(
                          editing[name] ?? (name === "insurance" ? [] : {}),
                        )}
                      />
                    }
                  </label>
                ),
              )}
              <label>
                <span>Informations fiscales relues</span>
                <input
                  name="reviewed"
                  type="checkbox"
                  defaultChecked={editing.reviewed === true}
                />
              </label>
            </>
          )}
          {form === "client" && (
            <>
              {field("company_name", "Nom / raison sociale", "text", true)}
              {select("client_kind", "Type", [
                ["individual", "Particulier"],
                ["professional", "Professionnel"],
              ])}
              {field("contact_email", "Email", "email")}
              {field("phone", "Téléphone")}
              {field("siret", "SIRET")}
              {field("vat_number", "Numéro TVA")}
              {field("billing_address", "Adresse de facturation")}
              {field("work_address", "Adresse du chantier")}
              <label>
                Autres adresses (JSON)
                <textarea
                  name="addresses"
                  defaultValue={JSON.stringify(editing.addresses ?? [])}
                />
              </label>
            </>
          )}
          {form === "project" && (
            <>
              {select(
                "client_id",
                "Client",
                clients.map((row) => [
                  value(row, "id"),
                  value(row, "company_name"),
                ]),
              )}
              {field("name", "Nom du chantier", "text", true)}
              {field("project_code", "Code unique du chantier", "text", true)}
            </>
          )}
          {form === "payment" && (
            <>
              {select(
                "client_id",
                "Client de cet émetteur",
                clients
                  .filter((row) => !row.archived_at)
                  .map((row) => [value(row, "id"), value(row, "company_name")]),
              )}
              {field("amount", "Montant reçu TTC (€)", "text", true)}
              {field("received_on", "Date réelle", "date", true)}
              {field("method", "Moyen de paiement", "text", true)}
              {select("qualification", "Qualification", [
                ["deposit", "Acompte"],
                ["earnest", "Arrhes"],
                ["unqualified", "À qualifier"],
              ])}
              {field("bank_reference", "Référence bancaire")}
              {field("notes", "Justificatif / notes")}
              {select(
                "quote_id",
                "Devis source",
                quotes.map((row) => [
                  value(row, "id"),
                  value(row, "quote_number") || "Brouillon",
                ]),
                false,
              )}
              <p className={s.wide}>
                Un règlement n’est pas une facture d’acompte. Vérifiez les
                obligations de facturation et TVA de l’émetteur.
              </p>
            </>
          )}
          {["allocate", "refund"].includes(form) && (
            <>
              {select(
                "payment_id",
                "Règlement encaissé",
                payments
                  .filter((row) => row.direction === "incoming")
                  .map((row) => [
                    value(row, "id"),
                    `${value(row, "received_on")} · ${money(row.amount_minor)} · ${label(row.client_id)}`,
                  ]),
              )}
              {field("amount", "Montant (€)", "text", true)}
              {form === "allocate" ? (
                select(
                  "invoice_id",
                  "Facture",
                  invoices
                    .filter(
                      (row) =>
                        row.lifecycle !== "draft" &&
                        row.document_kind !== "credit",
                    )
                    .map((row) => [
                      value(row, "id"),
                      value(row, "invoice_number"),
                    ]),
                )
              ) : (
                <>
                  {field("date", "Date du remboursement", "date", true)}
                  {field("method", "Moyen", "text", true)}
                  {field(
                    "allocation_id",
                    "ID de l’affectation à annuler si le règlement était affecté",
                  )}
                </>
              )}
            </>
          )}
          {form === "apply-credit" && (
            <>
              {select(
                "credit_id",
                "Avoir émis",
                invoices
                  .filter(
                    (row) =>
                      row.document_kind === "credit" &&
                      row.lifecycle !== "draft",
                  )
                  .map((row) => [
                    value(row, "id"),
                    value(row, "invoice_number"),
                  ]),
              )}
              {select(
                "invoice_id",
                "Facture d’origine",
                invoices
                  .filter(
                    (row) =>
                      row.document_kind !== "credit" &&
                      row.lifecycle !== "draft",
                  )
                  .map((row) => [
                    value(row, "id"),
                    value(row, "invoice_number"),
                  ]),
              )}
              {field("amount", "Montant imputé (€)", "text", true)}
            </>
          )}
          <div className={`${s.actions} ${s.wide}`}>
            <button type="submit" disabled={busy}>
              Confirmer et enregistrer
            </button>
            <button type="button" onClick={() => setForm(null)}>
              Fermer
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
function ImportDocument({
  issuer,
  clients,
  documents,
  refresh,
  setError,
}: {
  issuer: string;
  clients: Row[];
  documents: Row[];
  refresh: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [importKey] = useState(() => crypto.randomUUID()),
    [existing, setExisting] = useState("");
  return (
    <>
      <button disabled={!issuer} onClick={() => setOpen(!open)}>
        Importer un PDF historique
      </button>
      {open && (
        <form
          className={s.form}
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              busy ||
              !confirm(
                "Importer cet original privé avec les métadonnées saisies ? Aucun paiement ne sera inventé.",
              )
            )
              return;
            const fd = new FormData(e.currentTarget);
            for (const field of ["total_net", "total_vat", "total_gross"]) {
              const raw = String(fd.get(field) ?? "").trim().replace(/[\u00a0\u202f\s]/g, "").replace(",", ".");
              if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
                setError("Montant invalide : utilisez par exemple 1 250,50 ou 1250.50.");
                return;
              }
              fd.set(field, raw);
            }
            fd.set("issuer_id", issuer);
            fd.set("confirmed", "true");
            fd.set("import_key", importKey);
            setError("");
            setBusy(true);
            try {
              await api("/api/documents", { method: "POST", body: fd });
              setOpen(false);
              await refresh();
            } catch (error) {
              setError(textError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Client
            <select name="client_id" required>
              <option value="">Choisir</option>
              {clients.map((row) => (
                <option key={value(row, "id")} value={value(row, "id")}>
                  {value(row, "company_name")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="kind">
              <option value="invoice">Facture</option>
              <option value="quote">Devis</option>
            </select>
          </label>
          <label>
            Numéro historique
            <input name="number" required />
          </label>
          <label>
            Date d’émission
            <input name="date" type="date" required={!existing} />
          </label>
          <label>
            Statut déclaré
            <input
              name="status"
              required={!existing}
              placeholder="Ex. signé ou acquitté historique"
            />
          </label>
          <label>
            HT historique (€)
            <input name="total_net" inputMode="decimal" placeholder="Ex. 1 250,50" required={!existing} />
          </label>
          <label>
            TVA historique (€)
            <input name="total_vat" inputMode="decimal" placeholder="Ex. 1 250,50" required={!existing} />
          </label>
          <label>
            TTC historique (€)
            <input name="total_gross" inputMode="decimal" placeholder="Ex. 1 250,50" required={!existing} />
          </label>
          <label>
            Fichier original
            <input name="file" type="file" accept="application/pdf" required />
          </label>
          <button disabled={busy}>Confirmer l’import privé</button>
        </form>
      )}
    </>
  );
}
