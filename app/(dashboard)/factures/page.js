"use client"
import { useEffect, useState } from 'react'
import { createClerkSupabaseClient } from '@/lib/supabase/supabase'
import { useUser, useSession } from '@clerk/nextjs'
import { CheckCircle2, Clock, Receipt, Eye, XCircle, FileText, X } from "lucide-react"

export default function ListeFactures() {
  const { user } = useUser()
  const { session } = useSession()
  const [factures, setFactures] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('toutes')
  const [selectedFacture, setSelectedFacture] = useState(null)

  const fetchFactures = async () => {
    if (!session) return
    const client = createClerkSupabaseClient(session)
    const { data, error } = await client
      .from('factures')
      .select('*, document_items(*), clients(*)') 
      .order('created_at', { ascending: false })
    
    if (!error) setFactures(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchFactures() }, [session])

  const handleAcquitter = async (id) => {
    if (!confirm("Marquer cette facture comme payée ?")) return
    const client = createClerkSupabaseClient(session)
    const { error } = await client.from('factures').update({ statut: 'payée' }).eq('id', id)
    if (!error) fetchFactures()
  }

  const handleAnnuler = async (id) => {
    if (!confirm("Voulez-vous vraiment annuler cette facture ?")) return
    const client = createClerkSupabaseClient(session)
    const { error } = await client.from('factures').update({ statut: 'annulée' }).eq('id', id)
    if (!error) fetchFactures()
  }

  const facturesFiltrees = factures.filter(f => {
    if (filtre === 'toutes') return true
    if (filtre === 'en_attente') return f.statut !== 'payée' && f.statut !== 'annulée'
    return f.statut === filtre
  })

  if (loading) return <div className="p-10 font-black text-center text-slate-300 tracking-widest uppercase">Chargement...</div>

  return (
    <div className="space-y-8 relative">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Mes Factures</h1>
          <p className="text-slate-500 text-sm font-medium">Gérez vos encaissements et relances.</p>
        </div>
        
        <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
          {['toutes', 'en_attente', 'payée', 'annulée'].map((f) => (
            <button 
              key={f}
              onClick={() => setFiltre(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                filtre === f ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50">
              <th className="p-6">Client & Description</th>
              <th className="p-6">Montant TTC</th>
              <th className="p-6">Statut</th>
              <th className="p-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {facturesFiltrees.map((f) => (
              <tr key={f.id} className="group hover:bg-slate-50/50 transition-all">
                <td className="p-6">
                  <p className="font-bold text-slate-800">{f.description || "Prestation de service"}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                    {f.numero_facture || `FAC-${f.id.slice(0,5)}`} • {new Date(f.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </td>
                <td className="p-6 font-black text-slate-900 text-lg">
                  {Number(f.montant_ttc).toLocaleString()} €
                </td>
                <td className="p-6">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                    f.statut === 'payée' ? 'bg-green-50 text-green-600 border border-green-100' : 
                    f.statut === 'annulée' ? 'bg-red-50 text-red-600 border border-red-100' :
                    'bg-orange-50 text-orange-600 border border-orange-100'
                  }`}>
                    {f.statut === 'payée' ? <CheckCircle2 size={12}/> : f.statut === 'annulée' ? <XCircle size={12}/> : <Clock size={12}/>}
                    {f.statut}
                  </div>
                </td>
                <td className="p-6 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setSelectedFacture(f)}
                      className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                    >
                      <Eye size={16}/>
                    </button>
                    
                    {f.statut !== 'payée' && f.statut !== 'annulée' && (
                      <>
                        <button onClick={() => handleAcquitter(f.id)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 uppercase">
                          Acquitter
                        </button>
                        <button onClick={() => handleAnnuler(f.id)} className="p-2.5 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                          <XCircle size={16}/>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODALE D'APERÇU AJUSTÉE --- */}
      {selectedFacture && (
        <div 
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4 lg:p-10"
          onClick={() => setSelectedFacture(null)} // Ferme au clic sur l'overlay
        >
          <div 
            className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl rounded-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()} // Empêche la fermeture au clic sur le contenu
          >
            {/* Header de la modale avec bouton Fermer */}
            <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex justify-between items-center z-10">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Aperçu Document</span>
              <button 
                onClick={() => setSelectedFacture(null)}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-red-600 transition-all shadow-xl"
              >
                <X size={14}/> FERMER
              </button>
            </div>

            {/* Contenu format A4 réduit */}
            <div className="p-[1cm] lg:p-[1.5cm] flex flex-col text-left scale-[0.98]">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl mb-4 flex items-center justify-center overflow-hidden border border-slate-100">
                    {user?.imageUrl ? <img src={user.imageUrl} className="w-full h-full object-cover" /> : <FileText className="text-slate-300"/>}
                  </div>
                  <p className="text-[11px] font-black text-slate-900 uppercase tracking-tighter">Mon Entreprise</p>
                </div>
                <div className="text-right">
                  <h2 className="text-5xl font-black text-slate-100 uppercase tracking-tighter mb-1 select-none">FACTURE</h2>
                  <p className="font-black text-slate-800 text-sm">{selectedFacture.numero_facture || 'FAC-NON-DEFINI'}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Date: {new Date(selectedFacture.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mb-12 ml-auto text-right border-r-8 border-blue-600 pr-6 py-2">
                <p className="text-[10px] font-black text-slate-300 uppercase mb-2 tracking-widest">Destinataire</p>
                <p className="font-black text-slate-900 text-xl uppercase">{selectedFacture.clients?.nom_entreprise || "Client Inconnu"}</p>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {selectedFacture.clients?.adresse_numero} {selectedFacture.clients?.adresse_voie}<br/>
                  {selectedFacture.clients?.code_postal} {selectedFacture.clients?.ville}
                </p>
              </div>

              <table className="w-full mb-10">
                <thead>
                  <tr className="border-b-2 border-slate-900 text-[10px] uppercase font-black text-slate-400">
                    <th className="pb-4 text-left">Désignation</th>
                    <th className="pb-4 text-center w-20">Qté</th>
                    <th className="pb-4 text-right w-32">P.U HT</th>
                    <th className="pb-4 text-right w-32">TOTAL HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {selectedFacture.document_items?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-5 text-[12px] font-bold text-slate-800">{item.description}</td>
                      <td className="py-5 text-[11px] text-center text-slate-400 font-bold">{item.quantite} {item.unite}</td>
                      <td className="py-5 text-[11px] text-right text-slate-400 font-bold">{Number(item.prix_unitaire_ht).toFixed(2)}€</td>
                      <td className="py-5 text-[12px] text-right font-black text-slate-900">{(item.quantite * item.prix_unitaire_ht).toFixed(2)}€</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-auto flex justify-end">
                <div className="w-72 space-y-3 border-t-4 border-slate-900 pt-8">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-tight"><span>Total HT</span><span className="text-slate-900">{Number(selectedFacture.montant_ht).toFixed(2)} €</span></div>
                  {!selectedFacture.is_exonere && <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-tight"><span>TVA</span><span className="text-slate-900">{Number(selectedFacture.montant_tva).toFixed(2)} €</span></div>}
                  {selectedFacture.montant_acompte > 0 && <div className="flex justify-between text-[11px] font-black text-blue-600 uppercase"><span>Acompte versé</span><span>- {Number(selectedFacture.montant_acompte).toFixed(2)} €</span></div>}
                  <div className="flex justify-between text-2xl font-black text-slate-900 pt-4 border-t border-slate-100 uppercase">
                    <span>Total TTC</span>
                    <span>{Number(selectedFacture.montant_ttc - (selectedFacture.montant_acompte || 0)).toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}