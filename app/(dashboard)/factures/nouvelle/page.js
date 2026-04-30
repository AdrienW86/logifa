"use client"
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClerkSupabaseClient } from '@/lib/supabase/supabase'
import { useUser, useSession } from '@clerk/nextjs'
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { Plus, Trash2, GripVertical, Save, FileText, ChevronLeft, MapPin, Building2 } from "lucide-react"

const UNITES = ["unité", "forfait", "heure", "jour", "mois", "km", "lot"]

function FormulaireFacture() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientIdParam = searchParams.get('client')
  
  const { user } = useUser()
  const { session } = useSession()

  // --- ÉTATS ---
  const [loading, setLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [numDoc, setNumDoc] = useState("")
  const [isExonere, setIsExonere] = useState(false)
  
  // État pour vos propres infos (émetteur)
  const [monEntreprise, setMonEntreprise] = useState({
    nom: "",
    adresse: "",
    villeCP: "",
    siret: "",
    logo: ""
  })
  
  const [formData, setFormData] = useState({
    client_id: clientIdParam || '',
    date_emission: new Date().toISOString().split('T')[0],
    date_echeance: '',
    notes: '',
    montant_acompte: 0
  })

  const [items, setItems] = useState([
    { id: '1', type: 'item', description: 'Prestation de service', quantite: 1, unite: 'unité', prixHT: 0, tva: 20 }
  ])

  // --- INITIALISATION & CHARGEMENT ---
  useEffect(() => {
    async function loadData() {
      if (!session || !user) return
      const supabase = createClerkSupabaseClient(session)
      
      // 1. Récupération de VOS infos (Profil)
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profile) {
        setMonEntreprise({
          nom: profile.company_name || user.fullName || "Ma Société",
          adresse: `${profile.adresse_numero || ""} ${profile.adresse_voie || ""}`.trim(),
          villeCP: `${profile.code_postal || ""} ${profile.ville || ""}`.trim(),
          siret: profile.siret || "SIRET non renseigné",
          logo: user.imageUrl // On utilise l'avatar Clerk comme logo par défaut
        })
      }

      // 2. Génération numéro auto
      const date = new Date()
      setNumDoc(`FAC-${date.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`)

      // 3. Récupération infos client
      if (clientIdParam) {
        const { data } = await supabase.from('clients').select('*').eq('id', clientIdParam).single()
        if (data) setSelectedClient(data)
      }
    }
    loadData()
  }, [user, session, clientIdParam])

  // --- CALCULS ---
  const totalHT = items.reduce((acc, item) => 
    item.type === 'item' ? acc + (parseFloat(item.quantite || 0) * parseFloat(item.prixHT || 0)) : acc, 0
  )
  const totalTVA = isExonere ? 0 : items.reduce((acc, item) => {
    if (item.type === 'item') {
      const ligneHT = parseFloat(item.quantite || 0) * parseFloat(item.prixHT || 0)
      return acc + (ligneHT * (parseFloat(item.tva || 0) / 100))
    }
    return acc
  }, 0)
  const totalTTC = totalHT + totalTVA
  const netAPayer = totalTTC - formData.montant_acompte

  // --- ACTIONS ---
  const updateItem = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const handleSave = async () => {
    if (!formData.client_id) return alert("Client manquant")
    setLoading(true)
    try {
      const supabase = createClerkSupabaseClient(session)
      const { data: fact, error: fErr } = await supabase
        .from('factures')
        .insert([{
          user_id: user.id,
          client_id: formData.client_id,
          numero_facture: numDoc,
          montant_ht: totalHT,
          montant_tva: totalTVA,
          montant_ttc: totalTTC,
          montant_acompte: formData.montant_acompte,
          is_exonere: isExonere,
          statut: 'brouillon'
        }]).select().single()

      if (fErr) throw fErr

      const lines = items.map((item, index) => ({
        facture_id: fact.id,
        type: item.type,
        description: item.type === 'item' ? item.description : item.titre,
        quantite: item.type === 'item' ? parseFloat(item.quantite) : null,
        unite: item.type === 'item' ? item.unite : null,
        prix_unitaire_ht: item.type === 'item' ? parseFloat(item.prixHT) : 0,
        tva_taux: item.type === 'item' ? parseFloat(item.tva) : 0,
        tri_ordre: index
      }))

      const { error: iErr } = await supabase.from('document_items').insert(lines)
      if (iErr) throw iErr

      router.push(`/clients/${formData.client_id}`)
    } catch (err) {
      alert(err.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      
      {/* --- COLONNE ÉDITION (GAUCHE) --- */}
      <div className="lg:w-1/2 p-6 lg:p-10 overflow-y-auto max-h-screen border-r border-slate-200">
        <div className="max-w-2xl mx-auto space-y-8">
          
          <header className="flex items-center justify-between">
            <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
              <ChevronLeft size={18}/> Retour
            </button>
            <button 
              onClick={handleSave} 
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              <Save size={16}/> {loading ? "CHARGEMENT..." : "ENREGISTRER"}
            </button>
          </header>

          {/* MES INFOS (RAPPEL) */}
          <section className="bg-white p-6 rounded-[2rem] border border-slate-200/60 flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border">
                {monEntreprise.logo ? <img src={monEntreprise.logo} className="w-full h-full object-cover" /> : <Building2 className="text-slate-300" />}
             </div>
             <div>
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Émetteur</h2>
                <p className="text-sm font-bold text-slate-800">{monEntreprise.nom}</p>
                <p className="text-[10px] text-slate-500 font-medium">SIRET : {monEntreprise.siret}</p>
             </div>
          </section>

          {/* INFOS CLIENT (DESTINATAIRE) */}
          <section className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Client Destinataire</h2>
            {selectedClient ? (
              <div className="flex items-start gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black">
                  {selectedClient.nom_entreprise.charAt(0)}
                </div>
                <div>
                  <p className="font-black text-slate-800 text-lg">{selectedClient.nom_entreprise}</p>
                  <p className="text-xs text-slate-500 font-medium">{selectedClient.adresse_numero} {selectedClient.adresse_voie}, {selectedClient.ville}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold">Client introuvable</div>
            )}
          </section>

          {/* LISTE DES PRESTATIONS */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Détail des prestations</h2>
            <DragDropContext onDragEnd={(res) => { if(!res.destination) return; const n = Array.from(items); const [r] = n.splice(res.source.index,1); n.splice(res.destination.index,0,r); setItems(n); }}>
              <Droppable droppableId="items">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                    {items.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} className="flex items-center gap-3 group">
                            <div {...p.dragHandleProps} className="text-slate-300 group-hover:text-slate-500"><GripVertical size={18}/></div>
                            <div className={`flex-1 p-5 rounded-[1.5rem] border transition-all ${item.type === 'section' ? 'bg-slate-900 border-slate-900 shadow-lg' : 'bg-white border-slate-200 shadow-sm'}`}>
                              {item.type === 'section' ? (
                                <input className="bg-transparent text-white font-black w-full outline-none text-xs uppercase tracking-widest" value={item.titre} onChange={(e) => updateItem(item.id, 'titre', e.target.value)} />
                              ) : (
                                <div className="space-y-4">
                                  <div className="flex justify-between">
                                    <input className="font-bold text-slate-800 outline-none w-full bg-transparent" placeholder="Désignation..." value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
                                    <div className="flex items-center bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                                      <span className="text-[9px] font-black text-slate-400 mr-2">TVA</span>
                                      <input type="number" className="w-8 bg-transparent text-right text-xs font-bold text-slate-600" value={item.tva} onChange={(e) => updateItem(item.id, 'tva', e.target.value)} />
                                      <span className="text-[9px] font-black text-slate-400 ml-1">%</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                      <input type="number" className="w-14 bg-slate-50 rounded-xl p-2 text-sm text-center font-bold text-slate-700 outline-none" value={item.quantite} onChange={(e) => updateItem(item.id, 'quantite', e.target.value)} />
                                      <select className="text-[10px] font-black uppercase text-slate-400 bg-transparent outline-none cursor-pointer" value={item.unite} onChange={(e) => updateItem(item.id, 'unite', e.target.value)}>
                                        {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                                      </select>
                                    </div>
                                    <div className="flex-1 text-right flex items-center justify-end gap-2">
                                      <input type="number" className="w-28 text-right font-black text-slate-800 outline-none bg-transparent" value={item.prixHT} onChange={(e) => updateItem(item.id, 'prixHT', e.target.value)} />
                                      <span className="text-xs font-black text-slate-400 uppercase">€ HT</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18}/></button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            
            <div className="flex gap-3 pt-2">
              <button onClick={() => setItems([...items, { id: crypto.randomUUID(), type: 'item', description: '', quantite: 1, unite: 'unité', prixHT: 0, tva: 20 }])} className="flex items-center gap-2 text-[10px] font-black px-6 py-3 bg-white border border-slate-200 rounded-2xl uppercase hover:bg-slate-50 transition-all text-slate-600"><Plus size={14}/> Article</button>
              <button onClick={() => setItems([...items, { id: crypto.randomUUID(), type: 'section', titre: 'NOUVELLE SECTION' }])} className="flex items-center gap-2 text-[10px] font-black px-6 py-3 bg-white border border-slate-200 rounded-2xl uppercase hover:bg-slate-50 transition-all text-slate-600"><Plus size={14}/> Section</button>
            </div>
          </section>

          {/* RÉGLAGES FINANCIERS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="p-6 bg-white border border-slate-200 rounded-[2rem] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Exonération TVA</span>
                  <button onClick={() => setIsExonere(!isExonere)} className={`w-12 h-6 rounded-full relative transition-all ${isExonere ? 'bg-blue-600' : 'bg-slate-200'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isExonere ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                   <span className="text-[10px] font-black text-slate-500 uppercase">Acompte versé</span>
                   <div className="flex items-center gap-2">
                    <input type="number" className="w-20 text-right font-black text-blue-600 outline-none" value={formData.montant_acompte} onChange={(e) => setFormData({...formData, montant_acompte: parseFloat(e.target.value) || 0})} />
                    <span className="text-xs font-bold text-slate-400">€</span>
                   </div>
                </div>
             </div>

             <div className="p-8 bg-slate-900 rounded-[2rem] shadow-xl text-white flex flex-col justify-center relative overflow-hidden">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest relative z-10">Net à payer TTC</p>
                <p className="text-4xl font-black text-blue-400 relative z-10">{netAPayer.toLocaleString()} €</p>
                <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
             </div>
          </div>
        </div>
      </div>

      {/* --- APERÇU VISUEL A4 (DROITE) --- */}
      <div className="lg:w-1/2 bg-slate-200 flex justify-center p-8 lg:p-16 overflow-y-auto max-h-screen">
        <div className="w-full max-w-[21cm] bg-white shadow-2xl p-[1.5cm] flex flex-col min-h-[29.7cm] rounded-sm transform scale-90 lg:scale-100 origin-top">
          
          <div className="flex justify-between items-start mb-16">
            <div>
              <div className="w-16 h-16 bg-slate-50 rounded-2xl mb-6 flex items-center justify-center overflow-hidden border border-slate-100">
                {monEntreprise.logo ? <img src={monEntreprise.logo} className="w-full h-full object-cover" /> : <FileText className="text-slate-200" size={32}/>}
              </div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{monEntreprise.nom}</p>
              <div className="text-[10px] text-slate-400 leading-relaxed mt-2 uppercase font-bold">
                <p>{monEntreprise.adresse}</p>
                <p>{monEntreprise.villeCP}</p>
                <p className="mt-2 text-slate-600 border-t border-slate-50 pt-2 inline-block">SIRET : {monEntreprise.siret}</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-5xl font-black text-slate-100 uppercase tracking-tighter mb-2 italic">Facture</h2>
              <p className="font-black text-slate-800 text-sm">{numDoc}</p>
              <p className="text-[10px] text-slate-400 font-black uppercase mt-1 tracking-widest">{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          <div className="mb-16 ml-auto text-right border-r-[6px] border-blue-600 pr-6 py-2 bg-slate-50 rounded-l-xl">
            <p className="text-[10px] font-black text-slate-300 uppercase mb-1 tracking-widest">Destinataire</p>
            <p className="font-black text-slate-900 text-xl uppercase tracking-tighter">{selectedClient?.nom_entreprise || "NOM DU CLIENT"}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">
              {selectedClient?.adresse_numero} {selectedClient?.adresse_voie}<br/>
              {selectedClient?.code_postal} {selectedClient?.ville}
            </p>
          </div>

          <table className="w-full mb-12">
            <thead>
              <tr className="border-b-2 border-slate-900 text-[10px] uppercase font-black text-slate-400 tracking-widest">
                <th className="pb-4 text-left">Désignation</th>
                <th className="pb-4 text-center">Qté</th>
                <th className="pb-4 text-right">P.U HT</th>
                <th className="pb-4 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                item.type === 'section' ? (
                  <tr key={item.id} className="bg-slate-50">
                    <td colSpan="4" className="py-3 px-4 font-black text-[10px] text-slate-500 uppercase tracking-[0.3em]">{item.titre}</td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b border-slate-100 group">
                    <td className="py-5 text-xs font-bold text-slate-800">{item.description || "—"}</td>
                    <td className="py-5 text-[11px] text-center text-slate-400 font-bold">{item.quantite} {item.unite}</td>
                    <td className="py-5 text-[11px] text-right text-slate-400 font-bold">{parseFloat(item.prixHT).toLocaleString()} €</td>
                    <td className="py-5 text-xs text-right font-black text-slate-900">{(item.quantite * item.prixHT).toLocaleString()} €</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>

          <div className="mt-auto flex justify-end">
            <div className="w-72 space-y-3 border-t-2 border-slate-900 pt-8">
              <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Total HT</span>
                <span className="text-slate-900">{totalHT.toLocaleString()} €</span>
              </div>
              {!isExonere && (
                <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>TVA (20%)</span>
                  <span className="text-slate-900">{totalTVA.toLocaleString()} €</span>
                </div>
              )}
              {formData.montant_acompte > 0 && (
                <div className="flex justify-between text-[11px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 p-2 rounded-lg">
                  <span>Acompte</span>
                  <span>- {formData.montant_acompte.toLocaleString()} €</span>
                </div>
              )}
              <div className="flex justify-between text-2xl font-black text-slate-900 pt-5 border-t border-slate-100 uppercase tracking-tighter">
                <span>Net à payer</span>
                <span>{netAPayer.toLocaleString()} €</span>
              </div>
              {isExonere && <p className="text-[9px] text-slate-400 italic text-right mt-6 font-bold uppercase tracking-tighter">TVA non applicable, art. 293 B du CGI</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NouvelleFacturePage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center font-black text-slate-200 text-6xl animate-pulse">LANCEMENT...</div>}>
      <FormulaireFacture />
    </Suspense>
  )
}