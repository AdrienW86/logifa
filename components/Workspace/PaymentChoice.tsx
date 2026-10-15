'use client';
import {useEffect,useState} from 'react';
import {api,value,type Row} from '../../lib/workspace/client';
import {isRecord} from '../../lib/editor/contracts';
const money=(v:unknown)=>(Number(v)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
export default function PaymentChoice({issuer,payments,refund}:{issuer:string;payments:{id:string;label:string}[];refund:boolean}) {
  const [payment,setPayment]=useState(''),[allocations,setAllocations]=useState<Row[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[available,setAvailable]=useState<unknown>(null);
  useEffect(()=>{
    setAllocations([]);setError('');setAvailable(null);setLoading(false);
    if(!payment||!refund)return;
    let alive=true;setLoading(true);
    void api(`/api/payments/${encodeURIComponent(payment)}/allocations?issuer=${encodeURIComponent(issuer)}`).then(result=>{
      if(!alive)return;
      if(!Array.isArray(result.allocations)||!result.allocations.every(isRecord))throw new Error('Affectations indisponibles.');
      setAllocations(result.allocations);setAvailable(result.unallocated_minor);
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Affectations indisponibles.');}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[payment,issuer,refund]);
  return <>
    <label>Règlement<select aria-label="Règlement" name="payment_id" required value={payment} onChange={event=>setPayment(event.target.value)}>
      <option value="">Choisir</option>{payments.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
    </select></label>
    {refund&&<>
      {error&&<p role="alert">{error}</p>}
      <label>Facture dont le règlement doit être réduit
        <select aria-label="Facture dont le règlement doit être réduit" key={payment+String(loading)} name="allocation_id" disabled={loading||Boolean(error)||!payment} defaultValue="">
          <option value="">Rembourser uniquement la somme non affectée</option>
          {allocations.map(row=><option key={value(row,'id')} value={value(row,'id')}>{value(row,'invoice_number')} · {money(row.remaining_minor)} affectés</option>)}
        </select>
      </label>
      <p role="status">{loading?'Chargement des affectations…':error?'Corrigez cette erreur avant de rembourser.':available!==null?`${money(available)} non affectés. Le remboursement et la réduction de l’affectation seront contrôlés ensemble.`:'Choisissez le règlement à rembourser.'}</p>
      <input name="refund_ready" value={!loading && !error && payment && available !== null ? "true" : "false"} readOnly hidden />
    </>}
  </>;
}
