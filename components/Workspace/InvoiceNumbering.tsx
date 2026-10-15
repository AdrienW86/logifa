"use client";
import { useEffect, useState } from "react";
import { api, value, type Row } from "@/lib/workspace/client";
import s from "./workspace.module.css";
import { nextCounterFromExternalInvoice } from "@/lib/billing/invoice-numbering";

export default function InvoiceNumbering({issuer}:{issuer:string}) {
  const [status,setStatus]=useState<Row|null>(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [lastNumber,setLastNumber]=useState("");
  const [lastDate,setLastDate]=useState("");
  const [evidence,setEvidence]=useState("");
  const [confirmPhrase,setConfirmPhrase]=useState("");
  const load=async()=>{
    if (!issuer)return;
    const state=await api("/api/numbering?issuer="+encodeURIComponent(issuer));
    setStatus(state);
  };
  useEffect(()=>{
    setStatus(null);setMessage("");setLastNumber("");setLastDate("");
    setEvidence("");setConfirmPhrase("");
    if(issuer)void load().catch(e=>setMessage(e instanceof Error?e.message:"Numérotation indisponible."));
  },[issuer]);
  let nextCounter: number | null = null;
  let referenceError = "";
  if (lastNumber && lastDate) {
    try {nextCounter=nextCounterFromExternalInvoice(lastNumber.trim(),lastDate);}
    catch(error) {referenceError=error instanceof Error ? error.message : "Référence invalide.";}
  }
  return (
    <section className={s.card} aria-label="Reprise de la numérotation des factures">
      <h2>Numérotation fiscale de l'entreprise</h2>
      <p>Le numéro définitif est attribué uniquement lors de l'émission d'une facture, jamais pendant la préparation. La reprise d'une série externe nécessite un contrôle des anciennes factures.</p>
      {status && <>
        <p>Prochain compteur configuré : <strong>{String(status.next_value ?? "non initialisé")}</strong>.
        {" "}Dernière date connue : <strong>{value(status,"last_issue_date") || "non renseignée"}</strong>.</p>
        <p>Factures déjà enregistrées : <strong>{String(status.registered_invoices ?? 0)}</strong>.
          {" "}Identité fiscale : <strong>{status.legal_reviewed===true?"relue":"à valider"}</strong>.</p>
        {status.on_hold===true ? <>
          <p role="alert"><strong>Émission bloquée pour cette entreprise.</strong> {value(status,"hold_reason")}</p>
          <form className={s.form} onSubmit={async(event)=>{
            event.preventDefault();
            if (loading || confirmPhrase !== "JE CONFIRME LA SERIE") return;
            if(!confirm("Confirmez-vous avoir vérifié les factures déjà émises et la continuité de cette série ? Cette action débloquera la numérotation des nouvelles factures, sans créer de facture."))return;
            setLoading(true);
            try {
              const result=await api("/api/numbering",{
                method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({
                  issuer,last_number:lastNumber,last_date:lastDate,evidence,
                  confirmation:confirmPhrase,confirmed:true,
                }),
              });
              setMessage("Réconciliation enregistrée. Prochain compteur : "+String(result.new_next_value)+". L'émission restera soumise aux autres contrôles fiscaux.");
              setConfirmPhrase("");
              await load();
            } catch(e) {setMessage(e instanceof Error?e.message:"Réconciliation refusée.");}
            finally {setLoading(false);}
          }}>
            <label>Référence de la dernière facture émise hors Logifa
              <input value={lastNumber} onChange={e=>setLastNumber(e.target.value)}
                placeholder="D-AAAAMMJJ-XXXX" required maxLength={30}/>
            </label>
            <label>Date d'émission de cette facture
              <input value={lastDate} onChange={e=>setLastDate(e.target.value)}
                type="date" required/>
            </label>
            {lastNumber && lastDate && (
              <p role="status">
                {referenceError || "Référence cohérente avec la date : prochain compteur " + nextCounter + " (le numéro final dépendra de sa date d'émission)."}
              </p>
            )}
            <label>Justification de la série vérifiée (30 caractères minimum)
              <textarea rows={3} value={evidence} maxLength={2000} minLength={30}
                onChange={e=>setEvidence(e.target.value)}
                placeholder="Indiquez les archives contrôlées et l'absence de facture ultérieure. Ne saisissez pas de données personnelles du client."
                required/>
            </label>
            <label>Confirmation : saisir JE CONFIRME LA SERIE
              <input value={confirmPhrase} onChange={e=>setConfirmPhrase(e.target.value)}
                autoComplete="off" required/>
            </label>
            <button type="submit" disabled={loading ||
              confirmPhrase!=="JE CONFIRME LA SERIE" ||
              evidence.trim().length<30 || nextCounter===null}>
              {loading?"Vérification en cours…":"Valider la reprise de numérotation"}
            </button>
          </form>
          <p>Attention : plusieurs séries de factures distinctes peuvent exister. En cas d'incertitude, conservez ce verrou et faites rapprocher les archives comptables.</p>
        </> : <p>La séquence n'est pas actuellement bloquée par une réconciliation. Les vérifications légales avant émission restent obligatoires.</p>}
      </>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
