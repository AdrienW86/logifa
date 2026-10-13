"use client";
import { useEffect, useState } from "react";
import { api, value, type Row } from "@/lib/workspace/client";
import {
  initialDesign,
  parseDesign,
  parseTemplate,
  renderEmail,
  fictitiousContext,
  templateKinds,
  variables,
  type EmailTemplate,
  type TemplateKind,
  type EmailDesign,
} from "@/lib/email/templates";
import s from "./email-templates.module.css";
import { isRecord } from "@/lib/editor/contracts";
export const kindLabels: Record<TemplateKind, string> = {
  quote: "Devis",
  invoice: "Facture",
  deposit: "Acompte",
  paid: "Facture acquittée",
  reminder: "Relance",
};
export function HtmlPreview({ html }: { html: string }) {
  const [mobile, setMobile] = useState(false);
  // No scripts, forms or same-origin privileges, including for historical HTML.
  const document = html.replace(
    "<head>",
    "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'\">",
  );
  return (
    <div className={s.preview}>
      <div className={s.switch}>
        <button
          type="button"
          aria-pressed={!mobile}
          onClick={() => setMobile(false)}
        >
          Desktop
        </button>
        <button
          type="button"
          aria-pressed={mobile}
          onClick={() => setMobile(true)}
        >
          Mobile
        </button>
      </div>
      <iframe
        title="Aperçu du modèle e-mail"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={document}
        style={{ width: mobile ? "375px" : "100%", maxWidth: "100%" }}
      />
    </div>
  );
}
export default function EmailTemplates({ issuer }: { issuer: string }) {
  const [rows, setRows] = useState<EmailTemplate[]>([]),
    [selected, setSelected] = useState<EmailTemplate | null>(null),
    [name, setName] = useState("Nouveau modèle"),
    [kind, setKind] = useState<TemplateKind>("quote"),
    [design, setDesign] = useState<EmailDesign>(initialDesign("quote")),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<Row | null>(null);
  async function reload() {
    const result = await api(`/api/email-templates?issuer=${issuer}`);
    if (!Array.isArray(result.templates))
      throw Error("Réponse modèles invalide.");
    setRows(result.templates.map(parseTemplate));
  }
  useEffect(() => {
    let alive = true;
    setRows([]);
    setSelected(null);
    setHistory(null);
    setStatus("");
    api(`/api/email-templates?issuer=${issuer}`)
      .then((result) => {
        if (alive && Array.isArray(result.templates))
          setRows(result.templates.map(parseTemplate));
      })
      .catch(() => {
        if (alive)
          setStatus(
            "Les modèles seront disponibles après validation et application de la migration dédiée. L’envoi manuel existant reste disponible.",
          );
      });
    return () => {
      alive = false;
    };
  }, [issuer]);
  const pick = (template: EmailTemplate | null) => {
    setSelected(template);
    setHistory(null);
    setName(template?.name ?? "Nouveau modèle");
    setKind(template?.kind ?? "quote");
    setDesign(template?.design ?? initialDesign("quote"));
    setStatus("");
  };
  const execute = async (action: string, data: Row) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          issuer_id: issuer,
          data,
          confirmed: true,
        }),
      });
      if (action === "history") setHistory(result);
      else {
        await reload();
        if (action !== "initialize") pick(parseTemplate(result));
        setStatus("Modification confirmée par le serveur.");
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Opération indisponible.",
      );
    } finally {
      setBusy(false);
    }
  };
  let html = "",
    problem = "";
  try {
    html = renderEmail(parseDesign(design), fictitiousContext).html;
  } catch {
    problem =
      "Vérifiez les champs, variables, couleurs et liens HTTPS pour afficher l’aperçu.";
  }
  const patch = (key: keyof EmailDesign, text: string) =>
    setDesign((previous) => ({ ...previous, [key]: text }));
  return (
    <section className={s.shell} aria-label="Modèles d’e-mails">
      <div className={s.title}>
        <div>
          <h2>Modèles d’e-mails</h2>
          <p>
            Identité et messages propres à cet émetteur. Aucun envoi
            automatique.
          </p>
        </div>
        <button disabled={busy} onClick={() => pick(null)}>
          Créer un modèle
        </button>
      </div>
      <p role="status">{status}</p>
      {!rows.length && (
        <button disabled={busy} onClick={() => void execute("initialize", {})}>
          Créer les cinq modèles initiaux
        </button>
      )}
      <div className={s.layout}>
        <aside className={s.list} aria-label="Liste des modèles">
          {rows.map((row) => (
            <button
              key={row.id}
              aria-pressed={selected?.id === row.id}
              onClick={() => pick(row)}
            >
              <strong>{row.name}</strong>
              <span>
                {kindLabels[row.kind]} · v{row.revision}
                {row.is_default ? " · Par défaut" : ""}
                {row.archived ? " · Archivé" : ""}
              </span>
            </button>
          ))}
        </aside>
        <div>
          <form
            className={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              void execute("save", {
                name,
                kind,
                design: parseDesign(design),
                is_default: selected?.is_default ?? false,
                ...(selected
                  ? { id: selected.id, revision: selected.revision }
                  : {}),
              });
            }}
          >
            <label>
              Nom du modèle
              <input
                maxLength={100}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={selected?.archived}
              />
            </label>
            <label>
              Type
              <select
                value={kind}
                disabled={Boolean(selected)}
                onChange={(event) => {
                  const next = templateKinds.find(
                    (k) => k === event.target.value,
                  );
                  if (next) {
                    setKind(next);
                    setDesign(initialDesign(next));
                  }
                }}
              >
                {templateKinds.map((k) => (
                  <option value={k} key={k}>
                    {kindLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.wide}>
              Objet
              <input
                required
                maxLength={200}
                value={design.subject}
                onChange={(event) => patch("subject", event.target.value)}
              />
            </label>
            <label className={s.wide}>
              Texte du message
              <textarea
                aria-label="Texte du message"
                required
                rows={7}
                maxLength={10000}
                value={design.body}
                onChange={(event) => patch("body", event.target.value)}
              />
            </label>
            <label>
              Couleur principale
              <input
                type="color"
                value={design.color}
                onChange={(event) => patch("color", event.target.value)}
              />
            </label>
            <label>
              Fond
              <input
                type="color"
                value={design.background}
                onChange={(event) => patch("background", event.target.value)}
              />
            </label>
            <label>
              Typographie
              <select
                value={design.font}
                onChange={(event) => {
                  const font = event.target.value;
                  if (font === "sans" || font === "serif" || font === "verdana")
                    setDesign((previous) => ({ ...previous, font }));
                }}
              >
                <option value="sans">Arial · contemporaine</option>
                <option value="serif">Georgia · classique</option>
                <option value="verdana">Verdana · lisible</option>
              </select>
            </label>
            <label>
              Logo · URL HTTPS
              <input
                type="url"
                value={design.logo}
                onChange={(event) => patch("logo", event.target.value)}
                placeholder="https://votre-domaine/logo.png"
              />
            </label>
            <label>
              Signature
              <textarea
                rows={3}
                maxLength={2000}
                value={design.signature}
                onChange={(event) => patch("signature", event.target.value)}
              />
            </label>
            <label>
              Pied de page
              <textarea
                rows={3}
                maxLength={2000}
                value={design.footer}
                onChange={(event) => patch("footer", event.target.value)}
              />
            </label>
            <label>
              Libellé du lien
              <input
                value={design.linkLabel}
                maxLength={120}
                onChange={(event) => patch("linkLabel", event.target.value)}
              />
            </label>
            <label>
              Lien · URL HTTPS
              <input
                type="url"
                value={design.linkUrl}
                onChange={(event) => patch("linkUrl", event.target.value)}
              />
            </label>
            <details className={s.wide}>
              <summary>Variables autorisées</summary>
              <p>
                Insérez une variable dans le texte, la signature ou l’objet. Les
                liens et logos sont des URL HTTPS fixes.
              </p>
              <div className={s.variables}>
                {variables.map((v) => (
                  <code key={v}>{`{{${v}}}`}</code>
                ))}
              </div>
            </details>
            <button
              type="submit"
              disabled={busy || Boolean(problem) || selected?.archived}
            >
              Enregistrer {selected ? "une nouvelle version" : "le modèle"}
            </button>
          </form>
          {selected && (
            <div className={s.actions}>
              {[
                "duplicate",
                "default",
                selected.archived ? "restore" : "archive",
                "history",
              ].map((action) => (
                <button
                  disabled={busy || (action === "default" && selected.archived)}
                  key={action}
                  onClick={() => {
                    if (
                      action === "archive" &&
                      !confirm(
                        "Archiver ce modèle ? Ses versions et envois seront conservés.",
                      )
                    )
                      return;
                    void execute(action, {
                      id: selected.id,
                      revision: selected.revision,
                    });
                  }}
                >
                  {
                    {
                      duplicate: "Dupliquer",
                      default: "Définir par défaut",
                      archive: "Archiver",
                      restore: "Restaurer",
                      history: "Historique",
                    }[action]
                  }
                </button>
              ))}
            </div>
          )}
          {history && (
            <details open>
              <summary>Versions et utilisation</summary>
              <ul>
                {Array.isArray(history.versions) &&
                  history.versions.map((row: unknown, index) => {
                    const entry = isRecord(row) ? row : {};
                    return (
                      <li key={index}>
                        Version {value(entry, "revision")} ·{" "}
                        {value(entry, "created_at")}{" "}
                        <button
                          onClick={() => {
                            try {
                              const previous = parseTemplate(entry.snapshot);
                              pick(null);
                              setName(
                                previous.name +
                                  " (version " +
                                  previous.revision +
                                  ")",
                              );
                              setKind(previous.kind);
                              setDesign(previous.design);
                            } catch {
                              setStatus(
                                "Cette version ne peut pas être chargée.",
                              );
                            }
                          }}
                        >
                          Préparer une copie
                        </button>
                      </li>
                    );
                  })}
              </ul>
              <p>
                {Array.isArray(history.usage) ? history.usage.length : 0}{" "}
                envoi(s) lié(s) à ce modèle.
              </p>
            </details>
          )}
          <h3>Aperçu · données fictives de démonstration</h3>
          {problem ? (
            <p role="alert">{problem}</p>
          ) : (
            <HtmlPreview html={html} />
          )}
        </div>
      </div>
    </section>
  );
}
