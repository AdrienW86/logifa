"use client"
import { useState, useEffect, Suspense } from "react"
import { useUser, useSession } from "@clerk/nextjs"
import { createClerkSupabaseClient } from "@/lib/supabase/supabase"
import { useRouter, useSearchParams } from "next/navigation"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { PDFDownloadLink } from '@react-pdf/renderer'
import FacturePDF from '@/components/FacturePDF'
import { Plus, Trash2, GripVertical, Save, FileText, Eye, X } from "lucide-react"

const UNITES = ["unité", "forfait", "heure", "jour", "mois", "an", "km", "ml", "m2", "m3", "kg", "pièce", "lot"]

function FormulaireFacture() {
  const { user } = useUser()
  const { session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientIdFromUrl = searchParams.get('client')
  
  const [docType, setDocType] = useState('facture') 
  const [dbClients, setDbClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState("nouveau")
  const [isSaving, setIsSaving] = useState(false)
  const [numDoc, setNumDoc] = useState("")
  const [showPreview, setShowPreview] = useState(false) // État pour la modale
  const [montantAcompte, setMontantAcompte] = useState(0)

  const [monEntreprise, setMonEntreprise] = useState({ nom: "", adresse: "", villeCP: "", siret: "" })
  const [clientInfo, setClientInfo] = useState({ nom_entreprise: "", adresse_numero: "", adresse_voie: "", code_postal: "", ville: "" })
  const [isExonere, setIsExonere] = useState(false)
  const [items, setItems] = useState([
    { id: '1', type: 'item', description: 'Prestation de service', quantite: 1, unite: 'unité', prixHT: 0, tva: 20 }
  ])

  useEffect(() => {
    const date = new Date()
    const prefix = docType === 'facture' ? 'F' : 'D'
    setNumDoc(`${prefix}-${date.getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`)
    
    async function fetchData() {
      if (!session || !user) return
      const supabase = createClerkSupabaseClient(session)
      const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profiles) {
        setMonEntreprise({
          nom: profiles.company_name || user.fullName,
          adresse: `${profiles.num_voie || ""} ${profiles.nom_voie || ""}`.trim(),
          villeCP: `${profiles.code_postal || ""} ${profiles.ville || ""}`,
          siret: profiles.siret || ""
        })
      }
      const { data: clients } = await supabase.from('clients').select('*').order('nom_entreprise')
      setDbClients(clients || [])
      if (clientIdFromUrl && clients) {
        const found = clients.find(c => c.id === clientIdFromUrl)
        if (found) { setSelectedClientId(clientIdFromUrl); setClientInfo(found); }
      }
    }
    fetchData()
  }, [session, user, docType, clientIdFromUrl])

  const totalHT = items.reduce((acc, item) => item.type === 'item' ? acc + (parseFloat(item.quantite || 0) * parseFloat(item.prixHT || 0)) : acc, 0)
  const totalTVA = isExonere ? 0 : items.reduce((acc, item) => {
    if (item.type === 'item') {
      const ligneHT = parseFloat(item.quantite || 0) * parseFloat(item.prixHT || 0)
      return acc + (ligneHT * (parseFloat(item.tva || 0) / 100))
    }
    return acc
  }, 0)
  const totalTTC = totalHT + totalTVA

  const handleClientSelection = (id) => {
    setSelectedClientId(id)
    if (id === "nouveau") setClientInfo({ nom_entreprise: "", adresse_numero: "", adresse_voie: "", code_postal: "", ville: "" })
    else { const c = dbClients.find(client => client.id === id); if (c) setClientInfo(c); }
  }

  const handleSave = async () => {
    if (!clientInfo.nom_entreprise) return alert("Le client est requis")
    setIsSaving(true)
    try {
      const supabase = createClerkSupabaseClient(session)
      let finalClientId = selectedClientId
      if (selectedClientId === "nouveau") {
        const { data: newC, error: cErr } = await supabase.from('clients').insert([{ user_id: user.id, ...clientInfo }]).select().single()
        if (cErr) throw cErr
        finalClientId = newC.id
      }
      const commonData = {
        user_id: user.id, client_id: finalClientId, montant_ht: totalHT, montant_tva: totalTVA, montant_ttc: totalTTC,      
        is_exonere: isExonere, statut: 'brouillon', description: items[0]?.description || "Prestation"
      }
      let docId
      if (docType === 'devis') {
        const { data: d, error: dErr } = await supabase.from('devis').insert([{ ...commonData, numero_devis: numDoc }]).select().single()
        if (dErr) throw dErr; docId = d.id;
      } else {
        const { data: f, error: fErr } = await supabase.from('factures').insert([{ ...commonData, numero_facture: numDoc, montant_acompte: montantAcompte }]).select().single()
        if (fErr) throw fErr; docId = f.id;
      }
      const lines = items.map((item, index) => ({
        facture_id: docType === 'facture' ? docId : null, devis_id: docType === 'devis' ? docId : null,
        type: item.type, description: item.type === 'item' ? item.description : item.titre,
        quantite: item.type === 'item' ? parseFloat(item.quantite || 0) : null, unite: item.type === 'item' ? item.unite : null,
        prix_unitaire_ht: item.type === 'item' ? parseFloat(item.prixHT || 0) : 0, tva_taux: item.type === 'item' ? parseFloat(item.tva || 0) : 0, tri_ordre: index
      }))
      await supabase.from('document_items').insert(lines)
      router.push(docType === 'facture' ? '/factures' : '/devis')
    } catch (err) { alert("Erreur : " + err.message) } finally { setIsSaving(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      
      {/* FORMULAIRE PRINCIPAL (Plein écran sur tous les supports) */}
      <div className="max-w-4xl mx-auto p-4 md:p-10 pb-24">
        <div className="space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-200 gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
              <button onClick={() => setDocType('facture')} className={`flex-1 sm:px-6 py-2 rounded-lg text-[10px] font-black transition-all ${docType === 'facture' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>FACTURE</button>
              <button onClick={() => setDocType('devis')} className={`flex-1 sm:px-6 py-2 rounded-lg text-[10px] font-black transition-all ${docType === 'devis' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>DEVIS</button>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => setShowPreview(true)} className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-600 px-5 py-2 rounded-xl text-xs font-black hover:bg-slate-200 transition-all">
                <Eye size={14}/> APERÇU
              </button>
              <button onClick={handleSave} disabled={isSaving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 transition-all">
                <Save size={14}/> {isSaving ? "..." : "SAUVER"}
              </button>
            </div>
          </div>

          {/* Entreprise & Client */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="p-6 bg-white rounded-3xl border border-slate-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Émetteur</h2>
              <input type="text" className="w-full p-2 text-sm font-bold border-b border-slate-100 outline-none mb-2" value={monEntreprise.nom} onChange={(e) => setMonEntreprise({...monEntreprise, nom: e.target.value})} />
              <input type="text" className="w-full p-2 text-xs text-slate-500 outline-none" value={monEntreprise.adresse} onChange={(e) => setMonEntreprise({...monEntreprise, adresse: e.target.value})} />
            </section>
            <section className="p-6 bg-white rounded-3xl border border-slate-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Client</h2>
              <select className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold mb-2 outline-none" value={selectedClientId} onChange={(e) => handleClientSelection(e.target.value)}>
                <option value="nouveau">+ Nouveau client</option>
                {dbClients.map(c => <option key={c.id} value={c.id}>{c.nom_entreprise}</option>)}
              </select>
              <input type="text" placeholder="Entreprise *" className="w-full p-2 text-xs border-b border-slate-50 outline-none" value={clientInfo.nom_entreprise} onChange={(e) => setClientInfo({...clientInfo, nom_entreprise: e.target.value})} />
            </section>
          </div>

          {/* Items de facturation */}
          <section className="space-y-4">
            <DragDropContext onDragEnd={(res) => { if(!res.destination) return; const n = Array.from(items); const [r] = n.splice(res.source.index,1); n.splice(res.destination.index,0,r); setItems(n); }}>
              <Droppable droppableId="items">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                    {items.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} className="flex items-center gap-2">
                            <div {...p.dragHandleProps} className="text-slate-300 hidden sm:block"><GripVertical size={16}/></div>
                            <div className={`flex-1 p-4 rounded-2xl border ${item.type === 'section' ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                              {item.type === 'section' ? (
                                <input className="bg-transparent text-white font-black w-full outline-none text-[10px] uppercase tracking-widest" value={item.titre} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, titre: e.target.value} : i))} />
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex justify-between gap-2">
                                    <input className="font-bold text-sm outline-none w-full" placeholder="Désignation..." value={item.description} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, description: e.target.value} : i))} />
                                    <div className="flex items-center bg-slate-50 px-2 py-1 rounded-lg">
                                      <span className="text-[9px] font-black text-slate-400 mr-1">TVA</span>
                                      <input type="number" className="w-8 bg-transparent text-right text-xs font-bold" value={item.tva} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, tva: e.target.value} : i))} />
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4 border-t border-slate-50 pt-3">
                                    <input type="number" className="w-12 bg-slate-50 rounded-lg p-1 text-xs text-center font-bold" value={item.quantite} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, quantite: e.target.value} : i))} />
                                    <select className="text-[10px] font-black uppercase text-slate-400 bg-transparent" value={item.unite} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, unite: e.target.value} : i))}>
                                      {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                    <div className="flex-1 text-right">
                                      <input type="number" className="w-24 text-right font-black text-sm outline-none" value={item.prixHT} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, prixHT: e.target.value} : i))} />
                                      <span className="ml-1 text-[10px] font-bold text-slate-400">€ HT</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <div className="flex gap-2">
              <button onClick={() => setItems([...items, { id: crypto.randomUUID(), type: 'item', description: '', quantite: 1, unite: 'unité', prixHT: 0, tva: 20 }])} className="flex-1 flex items-center justify-center gap-2 text-[10px] font-black px-5 py-3 bg-white border border-slate-200 rounded-xl uppercase hover:bg-slate-50 transition-all"><Plus size={14}/> Article</button>
              <button onClick={() => setItems([...items, { id: crypto.randomUUID(), type: 'section', titre: 'NOUVELLE SECTION' }])} className="flex-1 flex items-center justify-center gap-2 text-[10px] font-black px-5 py-3 bg-white border border-slate-200 rounded-xl uppercase hover:bg-slate-50 transition-all"><Plus size={14}/> Section</button>
            </div>
          </section>

          {/* Totaux */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Auto-entrepreneur (TVA 0)</span>
                    <button onClick={() => setIsExonere(!isExonere)} className={`w-10 h-5 rounded-full relative transition-all ${isExonere ? 'bg-blue-600' : 'bg-slate-200'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isExonere ? 'left-6' : 'left-1'}`} /></button>
                </div>
                {docType === 'facture' && (
                  <div className="flex justify-between items-center border-t border-slate-50 pt-4">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Acompte versé</span>
                    <input type="number" className="w-20 text-right font-black text-blue-600 text-sm outline-none" value={montantAcompte} onChange={(e) => setMontantAcompte(parseFloat(e.target.value) || 0)} />
                  </div>
                )}
             </div>
             <div className="p-8 bg-slate-900 rounded-3xl shadow-xl text-white flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Net à payer TTC</p>
                <p className="text-4xl font-black">{ (totalTTC - (docType === 'facture' ? montantAcompte : 0)).toFixed(2) } €</p>
             </div>
          </div>
        </div>
      </div>

      {/* --- MODALE D'APERÇU PLEIN ÉCRAN --- */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          {/* Bouton fermer la modale */}
          <button 
            onClick={() => setShowPreview(false)}
            className="absolute top-6 right-6 z-[110] bg-white/10 hover:bg-white/20 p-3 rounded-full text-white transition-all"
          >
            <X size={24}/>
          </button>

          {/* Boutons d'action dans la modale */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[110]">
             <PDFDownloadLink 
                document={<FacturePDF monEntreprise={monEntreprise} clientInfo={clientInfo} items={items} numFacture={numDoc} totalHT={totalHT} totalTVA={totalTVA} totalTTC={totalTTC} isExonere={isExonere} logoUrl={user?.imageUrl} docType={docType} statut='brouillon' montantAcompte={montantAcompte} />} 
                fileName={`${numDoc}.pdf`}
                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl text-sm font-black shadow-2xl hover:bg-blue-700 transition-all scale-110"
              >
                {() => <><FileText size={18}/> TÉLÉCHARGER LE PDF</>}
              </PDFDownloadLink>
          </div>

          {/* Container A4 scrollable & scalable */}
          <div className="w-full h-full overflow-y-auto flex justify-center py-10 lg:py-20">
            <div className="origin-top transform scale-[0.35] sm:scale-[0.5] md:scale-[0.7] lg:scale-[0.85] xl:scale-100 transition-transform duration-300 shadow-2xl mb-20">
              <div className="w-[21cm] bg-white p-[1.5cm] flex flex-col min-h-[29.7cm] rounded-sm text-slate-900">
                
                {/* Structure Facture A4 (Identique au rendu final) */}
                <div className="flex justify-between items-start mb-16">
                  <div>
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl mb-4 flex items-center justify-center overflow-hidden">
                      {user?.imageUrl ? <img src={user.imageUrl} className="w-full h-full object-cover" /> : <FileText className="text-slate-300"/>}
                    </div>
                    <p className="text-xs font-black uppercase tracking-tight">{monEntreprise.nom || "MON ENTREPRISE"}</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed mt-1 max-w-[200px]">{monEntreprise.adresse}<br/>{monEntreprise.villeCP}</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-5xl font-black text-slate-100 uppercase tracking-tighter mb-2">{docType}</h2>
                    <p className="font-bold text-slate-900 text-sm">N° {numDoc}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="mb-16 ml-auto text-right border-r-8 border-blue-600 pr-6">
                  <p className="text-[10px] font-black text-slate-300 uppercase mb-1">Destinataire</p>
                  <p className="font-black text-slate-900 text-xl uppercase leading-none mb-2">{clientInfo.nom_entreprise || "NOM DU CLIENT"}</p>
                  <p className="text-[11px] text-slate-500">{clientInfo.adresse_numero} {clientInfo.adresse_voie},<br/>{clientInfo.code_postal} {clientInfo.ville}</p>
                </div>

                <table className="w-full mb-12">
                  <thead>
                    <tr className="border-b-2 border-slate-900 text-[10px] uppercase font-black text-slate-400">
                      <th className="pb-4 text-left">Désignation</th>
                      <th className="pb-4 text-center">Qté / Unité</th>
                      <th className="pb-4 text-right">P.U HT</th>
                      <th className="pb-4 text-right">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      item.type === 'section' ? (
                        <tr key={item.id} className="bg-slate-50"><td colSpan="4" className="py-3 px-4 font-black text-[10px] text-slate-500 uppercase tracking-[0.2em]">{item.titre}</td></tr>
                      ) : (
                        <tr key={item.id} className="border-b border-slate-50">
                          <td className="py-6 text-[12px] font-bold text-slate-800">{item.description}</td>
                          <td className="py-6 text-[11px] text-center text-slate-400 font-bold">{item.quantite} {item.unite}</td>
                          <td className="py-6 text-[11px] text-right text-slate-400 font-bold">{parseFloat(item.prixHT).toFixed(2)}€</td>
                          <td className="py-6 text-[12px] text-right font-black text-slate-900">{(item.quantite * item.prixHT).toFixed(2)}€</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>

                <div className="mt-auto flex justify-end">
                  <div className="w-72 space-y-3 border-t-2 border-slate-100 pt-8">
                    <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase"><span>Total HT</span><span className="text-slate-900">{totalHT.toFixed(2)} €</span></div>
                    {!isExonere && <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase"><span>TVA (20%)</span><span className="text-slate-900">{totalTVA.toFixed(2)} €</span></div>}
                    {montantAcompte > 0 && <div className="flex justify-between text-[11px] font-bold text-blue-600 uppercase"><span>Acompte déjà versé</span><span>- {montantAcompte.toFixed(2)} €</span></div>}
                    <div className="flex justify-between text-2xl font-black text-slate-900 pt-4 border-t border-slate-900 uppercase">
                      <span>Total TTC</span>
                      <span>{(totalTTC - (docType === 'facture' ? montantAcompte : 0)).toFixed(2)} €</span>
                    </div>
                    {isExonere && <p className="text-[9px] text-slate-400 italic text-right mt-6 font-bold leading-tight">TVA non applicable, article 293 B du Code Général des Impôts</p>}
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

export default function NouvelleFacture() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center font-black text-slate-200 text-4xl animate-pulse tracking-widest uppercase">Chargement...</div>}>
      <FormulaireFacture />
    </Suspense>
  )
}