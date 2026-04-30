// app/dashboard/devis/page.js
"use client"
import { useEffect, useState } from 'react'
import { createClerkSupabaseClient } from '@/lib/supabase/supabase'
import { useSession } from '@clerk/nextjs'
import { FileDown, RefreshCw } from "lucide-react"

export default function DevisPage() {
  const { session } = useSession()
  const [devis, setDevis] = useState([])

  useEffect(() => {
    async function loadDevis() {
      const supabase = createClerkSupabaseClient(session)
      const { data } = await supabase
        .from('devis')
        .select(`*, clients(nom_entreprise)`)
        .order('created_at', { ascending: false })
      setDevis(data || [])
    }
    if (session) loadDevis()
  }, [session])

  const convertirEnFacture = async (leDevis) => {
    const confirm = window.confirm("Convertir ce devis en facture ?")
    if (!confirm) return

    const supabase = createClerkSupabaseClient(session)
    
    // 1. Créer la facture à partir du devis
    const { data: fact, error: fErr } = await supabase
      .from('factures')
      .insert([{
        user_id: leDevis.user_id,
        client_id: leDevis.client_id,
        numero_facture: leDevis.numero_devis.replace('D-', 'F-'), // On change le préfixe
        montant_ht: leDevis.montant_ht,
        montant_tva: leDevis.montant_tva,
        montant_ttc: leDevis.montant_ttc,
        statut: 'brouillon'
      }])
      .select().single()

    if (fErr) return alert(fErr.message)

    // 2. Mettre à jour le statut du devis
    await supabase.from('devis').update({ statut: 'accepté' }).eq('id', leDevis.id)
    
    alert("Facture générée ! Vous allez être redirigé.")
    window.location.href = `/dashboard/factures`
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-black text-slate-800">Tous les devis</h1>
      <div className="grid gap-4">
        {devis.map(d => (
          <div key={d.id} className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><FileDown /></div>
               <div>
                  <p className="font-black text-slate-800">{d.numero_devis} - {d.clients?.nom_entreprise}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{d.statut}</p>
               </div>
            </div>
            <button 
              onClick={() => convertirEnFacture(d)}
              className="flex items-center gap-2 border-2 border-blue-600 text-blue-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-blue-600 hover:text-white transition-all"
            >
              <RefreshCw size={14}/> CONVERTIR EN FACTURE
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}