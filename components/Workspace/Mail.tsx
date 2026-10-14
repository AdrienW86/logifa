"use client";
import { useEffect, useState } from "react";
import { api, value, parseWorkspace, type Row } from "@/lib/workspace/client";
import s from "./workspace.module.css";
import EmailTemplates, { HtmlPreview, kindLabels } from "./EmailTemplates";
import { parseTemplate, type EmailTemplate } from "@/lib/email/templates";
async function mail(
  action: string,
  issuer: string,
  data: Row,
  confirmed = false,
) {
  return api("/api/mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, issuer_id: issuer, data, confirmed }),
  });
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Opération indisponible.";
export function MailSettings({ issuer }: { issuer: string }) {
  const [state, setState] = useState<Row>({}),
    [legacyIssuer, setLegacyIssuer] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const reload = async () => {
    try {
      setState(await api(`/api/mail?issuer=${issuer}`));
    } catch (e) {
      setStatus(message(e));
    }
  };
  useEffect(() => {
    setState({});
    setLegacyIssuer("");
    setStatus("");
    if (issuer) {
      void reload();
      void api(`/api/workspace?issuer=${issuer}`).then((raw) => {
        const data = parseWorkspace(raw);
        const target = data.lists.issuer_profiles.find((row) => row.id === issuer);
        if (!target) return;
        const normalize = (v: string) => v.replace(/\D/g,"");
        const old = data.lists.issuer_profiles.find((row) =>
          row.id !== issuer && row.active === false &&
          value(row,"commercial_name").trim().toLowerCase() ===
            value(target,"commercial_name").trim().toLowerCase() &&
          normalize(value(row,"source_siret")) !== "" &&
          normalize(value(row,"source_siret")) === normalize(value(target,"source_siret")));
        if (old) setLegacyIssuer(value(old,"id"));
      }).catch(() => { /* Mail settings still work without enterprise discovery. */ });
    }
  }, [issuer]);
  if (!issuer)
    return (
      <p>
        Choisissez l’émetteur dont vous souhaitez configurer le compte Resend.
      </p>
    );
  return (
    <section className={s.card}>
      <EmailTemplates key={issuer} issuer={issuer} />
      <h2>Compte Resend de cet émetteur</h2>
      <p>
        Chaque entreprise conserve son compte et son domaine. LOGIFA ne crée ni
        ne remplace aucun compte Resend.
      </p>
      <p>
        État :{" "}
        {state.configured === true
          ? state.domain_status === "verified"
            ? "domaine vérifié"
            : "domaine à vérifier"
          : "non configuré"}{" "}
        · Envoi réel :{" "}
        {state.sending_enabled === true
          ? "activé, confirmation obligatoire"
          : "désactivé"}
      </p>
      {status && <p role="status">{status}</p>}
      {legacyIssuer && state.configured !== true && (
        <div className={s.card}>
          <h3>Récupérer l'ancienne configuration e-mail</h3>
          <p>Une ancienne fiche inactive de cette entreprise possède probablement son compte Resend et ses modèles. Copier la configuration permet de conserver l'expéditeur sans recopier la clé API. L'ancienne configuration reste disponible jusqu'aux tests d'envoi.</p>
          <button type="button" disabled={busy} onClick={async () => {
            if (!confirm("Copier l'ancienne configuration Resend vers cette entreprise active ? La clé sera déchiffrée et rechiffrée sur le serveur, jamais envoyée au navigateur. Aucun message ne sera envoyé.")) return;
            setBusy(true);
            try {
              const result = await api("/api/mail/copy-issuer",{
                method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({confirmed:true,confirmation:"COPIER LA CONFIGURATION",
                  source_issuer:legacyIssuer,destination_issuer:issuer}),
              });
              setStatus(value(result,"message") || "Configuration copiée. Vérifiez le domaine et réalisez un essai d'envoi.");
              await reload();
            } catch(error) {
              setStatus("Copie non effectuée : "+message(error));
            } finally {setBusy(false);}
          }}>Copier le compte et les modèles de l'ancien profil</button>
        </div>
      )}
      <form
        key={`${issuer}:${state.key_version ?? 0}`}
        className={s.form}
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            busy ||
            !confirm(
              "Enregistrer ce compte pour cet émetteur ? La clé sera chiffrée ; toute modification demande une nouvelle vérification du domaine.",
            )
          )
            return;
          const element = event.currentTarget,
            fd = new FormData(element),
            data: Row = {};
          fd.forEach((v, key) => {
            if (typeof v === "string") data[key] = v;
          });
          const secretInput = element.elements.namedItem("api_key");
          if (secretInput instanceof HTMLInputElement) secretInput.value = "";
          setBusy(true);
          try {
            await mail("configure", issuer, data, true);
            setStatus(
              "Configuration enregistrée. La clé n’est jamais renvoyée au navigateur.",
            );
            await reload();
          } catch (e) {
            setStatus(message(e));
          } finally {
            delete data.api_key;
            setBusy(false);
          }
        }}
      >
        {[
          ["sender_name", "Nom d’expéditeur"],
          ["from_email", "Adresse d’expédition"],
          ["reply_to", "Adresse de réponse"],
          ["domain", "Domaine vérifié dans ce compte"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              defaultValue={value(state, name)}
              required
              type={
                name.includes("email") || name === "reply_to" ? "email" : "text"
              }
            />
          </label>
        ))}
        <label>
          Clé API propre au compte (nouvelle clé pour une rotation)
          <input
            name="api_key"
            type="password"
            autoComplete="new-password"
            placeholder={
              state.configured
                ? "Laisser vide pour conserver la clé actuelle"
                : "re_…"
            }
            required={state.configured !== true}
          />
        </label>
        {[
          ["signature", "Signature e-mail"],
          ["default_subject", "Objet par défaut"],
          ["default_body", "Message par défaut"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <textarea name={name} defaultValue={value(state, name)} />
          </label>
        ))}
        <div className={`${s.actions} ${s.wide}`}>
          <button disabled={busy}>Enregistrer / remplacer la clé</button>
          <button
            type="button"
            disabled={busy || state.configured !== true}
            onClick={async () => {
              if (
                !confirm(
                  "Vérifier le domaine dans le compte Resend de cet émetteur ? Cette action consulte Resend, sans envoyer de message.",
                )
              )
                return;
              setBusy(true);
              try {
                await mail("verify", issuer, {}, true);
                await reload();
                setStatus("Vérification terminée.");
              } catch (e) {
                setStatus(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Vérifier le domaine
          </button>
        </div>
      </form>
      <p>
        Copiez les enregistrements DNS exacts fournis dans le tableau de bord
        Resend de cette entreprise. Le bouton de vérification consulte ce compte
        ; une simple case cochée ne peut pas autoriser un domaine. La clé doit
        autoriser la consultation des domaines.
      </p>
      <p>
        Variables serveur : LOGIFA_EMAIL_ENCRYPTION_KEY (32 octets en base64),
        LOGIFA_EMAIL_ENABLED. Ne placez aucune clé Resend dans une variable
        NEXT_PUBLIC ou dans Git. La rotation conserve les historiques et
        réinitialise la vérification.
      </p>
      <details>
        <summary>Traçabilité des envois</summary>
        <ul>
          {Array.isArray(state.history) &&
            state.history.map((raw, index) => {
              const row = typeof raw === "object" && raw !== null ? raw : {};
              return <li key={index}>{JSON.stringify(row)}</li>;
            })}
        </ul>
        <p>
          « sent » signifie prise en charge par Resend, pas preuve de livraison
          ni transmission réglementaire. Une livraison incertaine doit être
          rapprochée du tableau de bord du compte avant tout nouvel envoi.
        </p>
      </details>
    </section>
  );
}
export function SendDocument({
  issuer,
  documentId,
  kind,
  recipient = "",
}: {
  issuer: string;
  documentId: string;
  kind: "quote" | "invoice";
  recipient?: string;
}) {
  const [open, setOpen] = useState(false),
    [templates, setTemplates] = useState<EmailTemplate[]>([]),
    [templateId, setTemplateId] = useState(""),
    [to, setTo] = useState(recipient),
    [subject, setSubject] = useState(
      kind === "quote" ? "Votre devis" : "Votre facture",
    ),
    [body, setBody] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setTemplates([]);
    setTemplateId("");
    setPreview(null);
    api(`/api/email-templates?issuer=${issuer}`)
      .then((result) => {
        if (!alive || !Array.isArray(result.templates)) return;
        const list = result.templates
          .map(parseTemplate)
          .filter(
            (t) =>
              !t.archived &&
              (kind === "quote"
                ? ["quote", "reminder"].includes(t.kind)
                : t.kind !== "quote"),
          );
        setTemplates(list);
        setTemplateId(
          list.find((t) => t.is_default && t.kind === kind)?.id ?? "",
        );
      })
      .catch(() => {
        /* Existing manual messages remain available before migration. */
      });
    api(`/api/mail?issuer=${issuer}`)
      .then((state) => {
        if (!alive) return;
        if (state.default_subject) setSubject(value(state, "default_subject"));
        if (state.default_body) setBody(value(state, "default_body"));
      })
      .catch((e) => {
        if (alive) setStatus(message(e));
      });
    return () => {
      alive = false;
    };
  }, [open, issuer]);
  const chosen = templates.find((t) => t.id === templateId);
  const templateInput = chosen
    ? { template_id: chosen.id, template_revision: chosen.revision }
    : {};
  const change = (callback: () => void) => {
    callback();
    setPreview(null);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)}>
        Envoyer {kind === "quote" ? "le devis" : "la facture"} par e-mail
      </button>
      {open && (
        <section className={s.card}>
          <h3>Préparer l’envoi</h3>
          <p>
            L’identité d’expédition est choisie d’après l’émetteur du document.
            Le PDF doit être émis et archivé. Aucun envoi sans aperçu valide et
            confirmation.
          </p>
          <div className={s.form}>
            <label className={s.wide}>
              Modèle de cet émetteur
              <select
                value={templateId}
                onChange={(event) =>
                  change(() => setTemplateId(event.target.value))
                }
              >
                <option value="">Message manuel existant</option>
                {templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {kindLabels[t.kind]} · {t.name} · v{t.revision}
                    {t.is_default ? " · par défaut" : ""}
                  </option>
                ))}
              </select>
            </label>
            {chosen && (
              <button
                type="button"
                disabled={busy || !to}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const result = await mail("preview", issuer, {
                      kind,
                      document_id: documentId,
                      to,
                      ...templateInput,
                      use_template_content: true,
                    });
                    setSubject(value(result, "subject"));
                    setBody(value(result, "editable_body"));
                    setPreview(result);
                    setStatus(
                      "Modèle appliqué. Vous pouvez modifier le message puis refaire l’aperçu.",
                    );
                  } catch (e) {
                    setStatus(message(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Appliquer le modèle au message
              </button>
            )}
            <label>
              Destinataire
              <input
                type="email"
                value={to}
                onChange={(e) => change(() => setTo(e.target.value))}
              />
            </label>
            <label>
              Objet
              <input
                value={subject}
                onChange={(e) => change(() => setSubject(e.target.value))}
              />
            </label>
            <label className={s.wide}>
              Message
              <textarea
                aria-label="Message"
                value={body}
                onChange={(e) => change(() => setBody(e.target.value))}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setPreview(
                    await mail("preview", issuer, {
                      kind,
                      document_id: documentId,
                      to,
                      subject,
                      body,
                      ...templateInput,
                    }),
                  );
                  setStatus("Aperçu préparé, aucun e-mail envoyé.");
                } catch (e) {
                  setStatus(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Prévisualiser le message et la pièce jointe
            </button>
          </div>
          <article className={s.card}>
            <h4>Aperçu {preview ? "vérifié côté serveur" : "local"}</h4>
            <p>Destinataire : {to}</p>
            <p>Objet : {subject}</p>
            {preview && typeof preview.html === "string" && (
              <HtmlPreview html={preview.html} />
            )}
            <p style={{ whiteSpace: "pre-wrap" }}>
              {preview ? value(preview, "body") : body}
            </p>
            {preview && (
              <>
                <p>
                  Expéditeur : {value(preview, "sender_name")} &lt;
                  {value(preview, "from_email")}&gt; · Réponse :{" "}
                  {value(preview, "reply_to")}
                </p>
                <a
                  href={`/api/documents/${value(preview, "file_id")}?issuer=${issuer}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Relire le PDF joint : {value(preview, "filename")}
                </a>
              </>
            )}
          </article>
          <button
            type="button"
            disabled={busy || preview?.ready !== true}
            onClick={async () => {
              if (
                !preview ||
                !confirm(
                  `Envoyer réellement ce document à ${to} depuis ${value(preview, "from_email")} ? Cette action peut consommer le quota du compte Resend.`,
                )
              )
                return;
              setBusy(true);
              try {
                const result = await mail(
                  "send",
                  issuer,
                  {
                    kind,
                    document_id: documentId,
                    to,
                    subject,
                    body,
                    ...templateInput,
                    key,
                    file_id: preview.file_id,
                    preview_token: preview.preview_token,
                  },
                  true,
                );
                setStatus(
                  result.already_claimed === true
                    ? "Cet envoi a déjà été enregistré. Aucun second message déclenché."
                    : "Message pris en charge par Resend.",
                );
                setPreview(null);
              } catch (e) {
                setStatus(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmer l’envoi réel
          </button>
          <p role="status">{status}</p>
          <p>
            Un e-mail et un PDF ne constituent pas une transmission via une
            plateforme agréée de facturation électronique. LOGIFA ne marque
            jamais cette action comme transmission réglementaire.
          </p>
        </section>
      )}
    </>
  );
}
