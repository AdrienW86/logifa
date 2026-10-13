"use client";
import { useState } from "react";
import type { DocumentKind } from "../../lib/editor/model";
import s from "./editor.module.css";

export default function PromptComposer({
  kind,
  value,
  onChange,
  onReview,
  onGenerate,
  agentEnabled = false,
}: {
  kind: DocumentKind;
  value: string;
  onChange: (v: string) => void;
  onReview: (p: unknown) => void;
  onGenerate?: () => Promise<void>;
  agentEnabled?: boolean;
}) {
  const [message, setMessage] = useState(""),
    [structured, setStructured] = useState(""),
    [busy, setBusy] = useState(false);
  const examples =
    kind === "devis"
      ? [
          "Prépare un devis pour un remplacement de toiture.",
          "Ajoute une section zinguerie et conserve mes prix.",
        ]
      : [
          "Prépare la facture des travaux de peinture réalisés.",
          "Prépare les informations d’un acompte reçu de 500 €.",
        ];
  return (
    <div className={s.prompt}>
      <div className={s.promptHeading}>
        <span className={s.spark}>✦</span>
        <div>
          <h2>Décrivez votre document</h2>
          <p>Une proposition à relire, puis à appliquer dans ce formulaire.</p>
        </div>
        <span className={s.badge}>
          {agentEnabled ? "À confirmer" : "Non activé"}
        </span>
      </div>
      <label className={s.srOnly} htmlFor="agent-prompt">
        Consigne pour l’agent
      </label>
      <textarea
        id="agent-prompt"
        placeholder={examples[0]}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className={s.promptFooter}>
        <p>
          {agentEnabled
            ? "Envoi des champs utiles uniquement après votre confirmation."
            : "Agent non activé. Aucun envoi de vos données."}
        </p>
        <button
          type="button"
          onClick={() =>
            setMessage(
              value.trim()
                ? "Consigne prête. Elle sera incluse si vous sauvegardez ce brouillon local. Aucune génération effectuée."
                : "Décrivez d’abord votre demande.",
            )
          }
        >
          Préparer la consigne <span aria-hidden>↗</span>
        </button>
        {onGenerate && (
          <button
            type="button"
            disabled={busy || !agentEnabled}
            onClick={async () => {
              setBusy(true);
              try {
                await onGenerate();
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Agent indisponible.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Préparation…" : "Demander une proposition IA"}
          </button>
        )}
      </div>
      <div className={s.examples}>
        {examples.map((example) => (
          <button
            type="button"
            key={example}
            onClick={() => {
              if (
                value.trim() &&
                !window.confirm(
                  "Remplacer la consigne actuelle par cet exemple ?",
                )
              )
                return;
              onChange(example);
            }}
          >
            {example}
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className={s.helper}>
          {message}
        </p>
      )}
      <details className={s.advanced}>
        <summary>Examiner une proposition structurée</summary>
        <p>
          Importez une proposition au format JSON pour la relire. Aucun champ ne
          sera modifié sans confirmation. L’acquittement ne peut pas être
          proposé. Un acompte déclaré reste non vérifié et ne crée aucun
          mouvement bancaire.
        </p>
        <label htmlFor="agent-json">Proposition à examiner</label>
        <textarea
          id="agent-json"
          rows={5}
          value={structured}
          onChange={(e) => setStructured(e.target.value)}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => {
            try {
              onReview(JSON.parse(structured));
              setMessage("");
            } catch {
              setMessage("La proposition doit être un objet JSON valide.");
            }
          }}
        >
          Voir les modifications proposées
        </button>
      </details>
    </div>
  );
}
