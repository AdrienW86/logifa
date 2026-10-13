"use client";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import {
  api,
  parseWorkspace,
  selectedIssuer,
  selectIssuer,
  value,
  type Row,
} from "@/lib/workspace/client";
export default function IssuerSelector() {
  const { user } = useUser(),
    [rows, setRows] = useState<Row[]>([]),
    [chosen, setChosen] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api("/api/workspace")
      .then((raw) => {
        if (!alive) return;
        setRows(
          parseWorkspace(raw).lists.issuer_profiles.filter(
            (row) => row.active !== false,
          ),
        );
        setChosen(selectedIssuer(user.id));
      })
      .catch(() => {
        if (alive) setError("Mode local");
      });
    return () => {
      alive = false;
    };
  }, [user]);
  useEffect(() => {
    const sync = () => {
      if (user) setChosen(selectedIssuer(user.id));
    };
    window.addEventListener("logifa:issuer", sync);
    return () => window.removeEventListener("logifa:issuer", sync);
  }, [user]);
  if (error) return <span>{error}</span>;
  return (
    <label style={{ display: "grid", fontSize: 12, gap: 4 }}>
      Émetteur actif
      <select
        aria-label="Émetteur actif"
        value={chosen}
        onChange={(event) => {
          setChosen(event.target.value);
          if (user) selectIssuer(user.id, event.target.value);
        }}
        style={{ maxWidth: 210, padding: 8, borderRadius: 8 }}
      >
        <option value="">Choisir une entreprise</option>
        {rows.map((row) => (
          <option key={value(row, "id")} value={value(row, "id")}>
            {value(row, "commercial_name")}
          </option>
        ))}
      </select>
    </label>
  );
}
