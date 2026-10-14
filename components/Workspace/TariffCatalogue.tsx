"use client";
import { useEffect, useState } from "react";
import { api, value, type Row } from "@/lib/workspace/client";
import s from "./workspace.module.css";

export default function TariffCatalogue({issuer}:{issuer:string}) {
  const [items,setItems] = useState<Row[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const reload = async () => {
    const result = await api(`/api/catalogue?issuer=${encodeURIComponent(issuer)}`);
    setItems(Array.isArray(result.items) ? result.items.filter(
      (item:unknown)=>Boolean(item) && typeof item==="object" && !Array.isArray(item),
    ) as Row[] : []);
  };
  useEffect(()=>{
    setItems([]);setMessage("");
    if (issuer) void reload().catch((error)=>{
      setMessage(error instanceof Error ? error.message:"Catalogue indisponible.");
    });
  },[issuer]);

  const change = async (action:"approve"|"archive",id:string)=>{
    const question=action==="approve"
      ? "Valider ce prix historique comme tarif actuel de cette entreprise ? Vérifiez le prix HT et la TVA."
      : "Archiver cette référence sans l'utiliser dans les prochains devis ?";
    if (!confirm(question)) return;
    setBusy(true);
    try {
      await api("/api/catalogue",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,issuer,id,confirmed:true}),
      });
      await reload();
      setMessage(action==="approve" ? "Tarif approuvé, uniquement pour cette entreprise." :
        "Tarif archivé.");
    } catch(error) {
      setMessage(error instanceof Error ? error.message : "Action refusée.");
    } finally {setBusy(false);}
  };
  return (
    <section className={s.card} aria-label="Grille tarifaire par entreprise">
      <h2>Tarifs de l'entreprise</h2>
      <p>Les prix extraits des PDF sont seulement des suggestions historiques. Ils ne deviennent utilisables pour les futurs devis qu'après votre approbation individuelle.</p>
      {message && <p role="status">{message}</p>}
      <p>{items.filter((item)=>!item.approved_at).length} suggestion(s) à vérifier ·
        {" "}{items.filter((item)=>Boolean(item.approved_at)).length} tarif(s) approuvé(s).</p>
      <div className={s.actions}><button type="button" disabled={busy}
        onClick={()=>void reload().catch((error)=>setMessage(error instanceof Error?error.message:"Erreur"))}>
        Actualiser les tarifs
      </button></div>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>Prestation</th><th>Unité</th><th>PU HT</th><th>TVA</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map((item)=>(
              <tr key={value(item,"id")}>
                <td><strong>{value(item,"description")}</strong>
                  <p style={{fontSize:12}}>Source : {value(item,"source_evidence") || "Saisie approuvée"}.</p>
                </td>
                <td>{value(item,"unit")}</td>
                <td>{value(item,"price_ht")} €</td>
                <td>{value(item,"vat_rate")} %</td>
                <td>{item.approved_at ? "Approuvé" : "À valider"}</td>
                <td><div className={s.actions}>
                  {!item.approved_at && <button type="button" disabled={busy}
                    onClick={()=>void change("approve",value(item,"id"))}>Valider</button>}
                  <button type="button" disabled={busy}
                    onClick={()=>void change("archive",value(item,"id"))}>Archiver</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <p>Aucun tarif proposé. Ouvrez un devis PDF historique, extrayez les lignes, puis proposez ses tarifs ici.</p>}
    </section>
  );
}
