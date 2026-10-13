"use client";
import { memo } from "react";
import type { Line } from "../../lib/editor/model";
import { units } from "../../lib/editor/model";
import s from "./editor.module.css";
const money = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(n.toFixed(2)),
  );
type Props = {
  line: Line;
  index: number;
  count: number;
  sectionAmount: number;
  onChange: (key: string, field: keyof Line, value: string) => void;
  onMove: (index: number, by: number) => void;
  onDuplicate: (key: string) => void;
  onRemove: (key: string) => void;
};
export default memo(function LineEditor({
  line: l,
  index: i,
  count,
  sectionAmount,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: Props) {
  return (
    <article
      className={l.type === "title" ? s.titleLine : s.line}
      aria-label={`Poste ${i + 1}`}
    >
      <div className={s.lineHeader}>
        <span>
          {String(i + 1).padStart(2, "0")} ·{" "}
          {l.type === "title" ? "SECTION" : "PRESTATION"}
        </span>
        <div>
          <button
            type="button"
            aria-label={`Monter le poste ${i + 1}`}
            disabled={i === 0}
            onClick={() => onMove(i, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Descendre le poste ${i + 1}`}
            disabled={i === count - 1}
            onClick={() => onMove(i, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`Dupliquer le poste ${i + 1}`}
            onClick={() => onDuplicate(l.key)}
          >
            Dupliquer
          </button>
          <button
            type="button"
            aria-label={`Supprimer le poste ${i + 1}`}
            onClick={() => onRemove(l.key)}
          >
            ×
          </button>
        </div>
      </div>
      <label htmlFor={`line-name-${l.key}`}>
        {l.type === "title" ? "Titre de section" : "Désignation *"}
      </label>
      <textarea
        id={`line-name-${l.key}`}
        rows={
          l.name.includes("\n") ? Math.min(8, l.name.split("\n").length + 1) : 2
        }
        value={l.name}
        onChange={(e) => onChange(l.key, "name", e.target.value)}
        placeholder={
          l.type === "title"
            ? "Ex. Travaux de couverture"
            : "Décrivez précisément les travaux…"
        }
      />
      {l.type === "normal" ? (
        <div className={s.lineNumbers}>
          <label>
            Quantité *
            <input
              type="number"
              min="0.01"
              step="any"
              inputMode="decimal"
              value={l.quantity}
              onChange={(e) => onChange(l.key, "quantity", e.target.value)}
            />
          </label>
          <label>
            Unité
            <select
              value={l.unit}
              onChange={(e) => onChange(l.key, "unit", e.target.value)}
            >
              {!l.unit ? (
                <option value="">À compléter</option>
              ) : (
                !units.includes(l.unit) && <option>{l.unit}</option>
              )}
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label>
            PU HT (€) *
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={l.price}
              onChange={(e) => onChange(l.key, "price", e.target.value)}
            />
          </label>
          <label>
            TVA (%)
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              inputMode="decimal"
              value={l.tva}
              onChange={(e) => onChange(l.key, "tva", e.target.value)}
            />
          </label>
          <div className={s.lineTotal}>
            <span>Montant HT</span>
            <strong>
              {money((Number(l.quantity) || 0) * (Number(l.price) || 0))}
            </strong>
          </div>
        </div>
      ) : (
        <p className={s.sectionSubtotal}>
          Sous-total de section : {money(sectionAmount)}
        </p>
      )}
    </article>
  );
});
