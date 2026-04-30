"use client"
import { useState, useEffect, Suspense } from "react" // Ajout de Suspense pour useSearchParams
import { useUser, useSession } from "@clerk/nextjs"
import { createClerkSupabaseClient } from "@/lib/supabase/supabase"
import { useRouter, useSearchParams } from "next/navigation" // Ajout de useSearchParams
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { PDFDownloadLink } from '@react-pdf/renderer'
import FacturePDF from '@/components/FacturePDF'
import { Plus, Trash2, GripVertical, Save, FileText } from "lucide-react"

const UNITES = ["unité", "forfait", "heure", "jour", "mois", "an", "km", "ml", "m2", "m3", "kg", "pièce", "lot"]

// On sépare le formulaire dans un sous-composant pour utiliser useSearchParams avec Suspense
function FormulaireFacture() {
  const { user } = useUser()
  const { session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientIdFromUrl = searchParams.get('client') // Récupération de l'ID client depuis l'URL
  
  // --- ÉTATS ---
  const [docType, setDocType] = useState('facture') 
  const [dbClients, setDbClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState("nouveau")
  const [isSaving, setIsSaving] = useState(false)
  const [numDoc, setNumDoc] = useState("")
  const [statut, setStatut] = useState('brouillon')
  const [montantAcompte, setMontantAcompte] = useState(0)

  const [monEntreprise, setMonEntreprise] = useState({ nom: "", adresse: "", villeCP: "", siret: "" })
  const [clientInfo, setClientInfo] = useState({ nom_entreprise: "", adresse_numero: "", adresse_voie: "", code_postal: "", ville: "" })
  
  const [isExonere, setIsExonere] = useState(false)
  const [items, setItems] = useState([
    { id: '1', type: 'item', description: 'Prestation de service', quantite: 1, unite: 'unité', prixHT: 0, tva: 20 }
  ])

  // --- INITIALISATION ---
  useEffect(() => {
    const date = new Date()
    const prefix = docType === 'facture' ? 'F' : 'D'
    setNumDoc(`${prefix}-${date.getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`)
    
    async function fetchData() {
      if (!session || !user) return
      const supabase = createClerkSupabaseClient(session)
      
      // Profil Entreprise
      const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profiles) {
        setMonEntreprise({
          nom: profiles.company_name || user.fullName,
          adresse: `${profiles.num_voie || ""} ${profiles.nom_voie || ""}`.trim(),
          villeCP: `${profiles.code_postal || ""} ${profiles.ville || ""}`,
          siret: profiles.siret || ""
        })
      }
      
      // Liste Clients
      const { data: clients } = await supabase.from('clients').select('*').order('nom_entreprise')
      const clientsList = clients || []
      setDbClients(clientsList)

      // --- LOGIQUE DE PRÉ-SÉLECTION ---
      // Si un client est passé en URL, on le cherche et on l'applique
      if (clientIdFromUrl && clientsList.length > 0) {
        const found = clientsList.find(c => c.id === clientIdFromUrl)
        if (found) {
          setSelectedClientId(clientIdFromUrl)
          setClientInfo(found)
        }
      }
    }
    fetchData()
  }, [session, user, docType, clientIdFromUrl]) // Ajout de clientIdFromUrl en dépendance

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

  // --- ACTIONS ---
  const handleClientSelection = (id) => {
    setSelectedClientId(id)
    if (id === "nouveau") {
      setClientInfo({ nom_entreprise: "", adresse_numero: "", adresse_voie: "", code_postal: "", ville: "" })
    } else {
      const c = dbClients.find(client => client.id === id)
      if (c) setClientInfo(c)
    }
  }

  const updateItem = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const handleSave = async () => {
    if (!clientInfo.nom_entreprise) return alert("Le client est requis")
    if (!user) return alert("Session expirée")
    
    setIsSaving(true)
    try {
      const supabase = createClerkSupabaseClient(session)
      let finalClientId = selectedClientId

      // 1. Créer le client si nouveau
      if (selectedClientId === "nouveau") {
        const { data: newC, error: cErr } = await supabase
          .from('clients')
          .insert([{ user_id: user.id, ...clientInfo }])
          .select().single()
        if (cErr) throw cErr
        finalClientId = newC.id
      }

      // 2. Préparer les données pour la table principale
      // On envoie 'montant' ET 'montant_ttc' pour être sûr que ça marche peu importe la version
      const commonData = {
        user_id: user.id,
        client_id: finalClientId,
        montant_ht: totalHT,
        montant_tva: totalTVA,
        montant_ttc: totalTTC,      
        is_exonere: isExonere,
        statut: statut,
        description: items[0]?.description || "Prestation" // <--- AJOUT : Requis pour ton dashboard
      }

      let docId
      if (docType === 'devis') {
        const { data: devis, error: dErr } = await supabase
          .from('devis')
          .insert([{ ...commonData, numero_devis: numDoc }])
          .select().single()
        if (dErr) throw dErr
        docId = devis.id
      } else {
        const { data: fact, error: fErr } = await supabase
          .from('factures')
          .insert([{ 
            ...commonData, 
            numero_facture: numDoc, 
            montant_acompte: montantAcompte 
          }])
          .select().single()
        if (fErr) throw fErr
        docId = fact.id
      }

      // 3. Insérer les lignes de détails (items)
      const lines = items.map((item, index) => ({
        facture_id: docType === 'facture' ? docId : null,
        devis_id: docType === 'devis' ? docId : null,
        type: item.type,
        description: item.type === 'item' ? item.description : item.titre,
        quantite: item.type === 'item' ? parseFloat(item.quantite || 0) : null,
        unite: item.type === 'item' ? item.unite : null,
        prix_unitaire_ht: item.type === 'item' ? parseFloat(item.prixHT || 0) : 0,
        tva_taux: item.type === 'item' ? parseFloat(item.tva || 0) : 0,
        tri_ordre: index
      }))

      const { error: itemsErr } = await supabase.from('document_items').insert(lines)
      if (itemsErr) throw itemsErr

      alert(`${docType.toUpperCase()} enregistré !`)
      router.push(docType === 'facture' ? '/factures' : '/devis')
    } catch (err) {
      console.error("Détail de l'erreur:", err) // Pour voir l'erreur précise en console F12
      alert("Erreur lors de l'enregistrement : " + err.message)
    } finally { setIsSaving(false) }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans">
      {/* --- COLONNE ÉDITION (GAUCHE) --- */}
      <div className="lg:w-1/2 p-6 lg:p-10 overflow-y-auto max-h-screen border-r border-slate-200">
        <div className="max-w-2xl mx-auto space-y-6">
          
          <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-200 sticky top-0 z-30">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setDocType('facture')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${docType === 'facture' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>FACTURE</button>
              <button onClick={() => setDocType('devis')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${docType === 'devis' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>DEVIS</button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-black hover:bg-blue-700 transition-all disabled:opacity-50">
                <Save size={14}/> {isSaving ? "..." : "SAUVER"}
              </button>
              <PDFDownloadLink 
                key={JSON.stringify(items) + isExonere + docType + statut + montantAcompte}
                document={
                  <FacturePDF 
                    monEntreprise={monEntreprise} clientInfo={clientInfo} items={items} 
                    numFacture={numDoc} totalHT={totalHT} totalTVA={totalTVA} totalTTC={totalTTC} 
                    isExonere={isExonere} logoUrl={user?.imageUrl} docType={docType} 
                    statut={statut} montantAcompte={montantAcompte}
                  />
                } 
                fileName={`${numDoc}.pdf`}
                className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2 rounded-xl text-xs font-black hover:bg-slate-900 transition-all shadow-md"
              >
                {({ loading }) => (loading ? "..." : <><FileText size={14}/> PDF</>)}
              </PDFDownloadLink>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="p-5 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Mon Entreprise</h2>
              <input type="text" className="w-full p-2 text-sm font-bold border-b border-slate-100 outline-none mb-2" value={monEntreprise.nom} onChange={(e) => setMonEntreprise({...monEntreprise, nom: e.target.value})} />
              <input type="text" className="w-full p-2 text-xs text-slate-500 outline-none" value={monEntreprise.adresse} onChange={(e) => setMonEntreprise({...monEntreprise, adresse: e.target.value})} />
            </section>

            <section className="p-5 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Client</h2>
              <select className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold mb-2 outline-none" value={selectedClientId} onChange={(e) => handleClientSelection(e.target.value)}>
                <option value="nouveau">+ Nouveau client</option>
                {dbClients.map(c => <option key={c.id} value={c.id}>{c.nom_entreprise}</option>)}
              </select>
              <input type="text" placeholder="Entreprise *" className="w-full p-2 text-xs border-b border-slate-50 outline-none" value={clientInfo.nom_entreprise} onChange={(e) => setClientInfo({...clientInfo, nom_entreprise: e.target.value})} />
            </section>
          </div>

          <section className="space-y-4">
            <DragDropContext onDragEnd={(res) => { if(!res.destination) return; const n = Array.from(items); const [r] = n.splice(res.source.index,1); n.splice(res.destination.index,0,r); setItems(n); }}>
              <Droppable droppableId="items">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                    {items.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} className="flex items-center gap-2 group">
                            <div {...p.dragHandleProps} className="text-slate-300"><GripVertical size={16}/></div>
                            <div className={`flex-1 p-4 rounded-2xl border transition-all ${item.type === 'section' ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                              {item.type === 'section' ? (
                                <input className="bg-transparent text-white font-black w-full outline-none text-[10px] uppercase tracking-widest" value={item.titre} onChange={(e) => updateItem(item.id, 'titre', e.target.value)} />
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex justify-between items-start">
                                    <input className="font-bold text-sm outline-none w-full mr-4" placeholder="Désignation..." value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
                                    <div className="flex items-center bg-slate-50 px-2 py-1 rounded-lg">
                                      <span className="text-[9px] font-black text-slate-400 mr-1">TVA</span>
                                      <input type="number" className="w-8 bg-transparent text-right text-xs font-bold" value={item.tva} onChange={(e) => updateItem(item.id, 'tva', e.target.value)} />
                                      <span className="text-[9px] font-black text-slate-400">%</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 border-t border-slate-50 pt-3">
                                    <input type="number" className="w-12 bg-slate-50 rounded-lg p-1.5 text-xs text-center font-bold" value={item.quantite} onChange={(e) => updateItem(item.id, 'quantite', e.target.value)} />
                                    <select className="text-[10px] font-black uppercase text-slate-400 bg-transparent outline-none" value={item.unite} onChange={(e) => updateItem(item.id, 'unite', e.target.value)}>
                                      {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                    <div className="flex-1 text-right">
                                      <input type="number" className="w-24 text-right font-black text-sm outline-none" value={item.prixHT} onChange={(e) => updateItem(item.id, 'prixHT', e.target.value)} />
                                      <span className="ml-1 text-xs font-bold text-slate-400">€ HT</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
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
              <button onClick={() => setItems([...items, { id: crypto.randomUUID(), type: 'item', description: '', quantite: 1, unite: 'unité', prixHT: 0, tva: 20 }])} className="flex items-center gap-2 text-[10px] font-black px-5 py-2.5 bg-white border border-slate-200 rounded-xl uppercase hover:bg-slate-50 transition-all"><Plus size={14}/> Article</button>
              <button onClick={() => setItems([...items, { id: crypto.randomUUID(), type: 'section', titre: 'NOUVELLE SECTION' }])} className="flex items-center gap-2 text-[10px] font-black px-5 py-2.5 bg-white border border-slate-200 rounded-xl uppercase hover:bg-slate-50 transition-all"><Plus size={14}/> Section</button>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <section className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Auto-entrepreneur (TVA)</span>
                <button onClick={() => setIsExonere(!isExonere)} className={`w-10 h-5 rounded-full relative transition-all ${isExonere ? 'bg-blue-600' : 'bg-slate-200'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isExonere ? 'left-6' : 'left-1'}`} />
                </button>
              </section>
              {docType === 'facture' && (
                <section className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Acompte versé</span>
                    <input type="number" className="w-20 text-right font-black text-blue-600 text-sm outline-none" value={montantAcompte} onChange={(e) => setMontantAcompte(parseFloat(e.target.value) || 0)} />
                  </div>
                </section>
              )}
            </div>
            <div className="p-6 bg-slate-800 rounded-3xl shadow-xl text-white flex flex-col justify-center">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Total à régler TTC</p>
              <p className="text-3xl font-black">{ (totalTTC - (docType === 'facture' ? montantAcompte : 0)).toFixed(2) } €</p>
            </div>
          </div>
        </div>
      </div>

      {/* --- APERÇU VISUEL (DROITE) --- */}
      <div className="lg:w-1/2 bg-slate-200 flex justify-center p-8 lg:p-12 overflow-y-auto max-h-screen">
        <div className="w-full max-w-[21cm] bg-white shadow-2xl p-[1.2cm] flex flex-col min-h-[29.7cm] rounded-sm">
          <div className="flex justify-between items-start mb-12">
            <div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl mb-4 flex items-center justify-center">
                {user?.imageUrl ? <img src={user.imageUrl} className="rounded-xl" /> : <FileText className="text-slate-300"/>}
              </div>
              <p className="text-[10px] font-black text-slate-900 uppercase">{monEntreprise.nom || "MON ENTREPRISE"}</p>
              <p className="text-[9px] text-slate-400 leading-tight mt-1">{monEntreprise.adresse}<br/>{monEntreprise.villeCP}</p>
            </div>
            <div className="text-right">
              <h2 className="text-4xl font-black text-slate-100 uppercase tracking-tighter mb-1">{docType}</h2>
              <p className="font-bold text-slate-800 text-xs">{numDoc}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <div className="mb-12 ml-auto text-right border-r-4 border-blue-600 pr-5">
            <p className="text-[9px] font-black text-slate-300 uppercase mb-1">Destinataire</p>
            <p className="font-black text-slate-900 text-lg uppercase">{clientInfo.nom_entreprise || "NOM DU CLIENT"}</p>
            <p className="text-[10px] text-slate-500">{clientInfo.adresse_numero} {clientInfo.adresse_voie}, {clientInfo.code_postal} {clientInfo.ville}</p>
          </div>

          <table className="w-full mb-10">
            <thead>
              <tr className="border-b-2 border-slate-900 text-[9px] uppercase font-black text-slate-400">
                <th className="pb-3 text-left">Désignation</th>
                <th className="pb-3 text-center">Qté</th>
                <th className="pb-3 text-right">P.U HT</th>
                <th className="pb-3 text-right">TOTAL HT</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                item.type === 'section' ? (
                  <tr key={item.id} className="bg-slate-50"><td colSpan="4" className="py-2 px-3 font-black text-[9px] text-slate-400 uppercase tracking-widest">{item.titre}</td></tr>
                ) : (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="py-4 text-[11px] font-bold text-slate-800">{item.description}</td>
                    <td className="py-4 text-[10px] text-center text-slate-400 font-bold">{item.quantite} {item.unite}</td>
                    <td className="py-4 text-[10px] text-right text-slate-400 font-bold">{parseFloat(item.prixHT).toFixed(2)}€</td>
                    <td className="py-4 text-[11px] text-right font-black text-slate-900">{(item.quantite * item.prixHT).toFixed(2)}€</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>

          <div className="mt-auto flex justify-end">
            <div className="w-64 space-y-2 border-t-2 border-slate-50 pt-6">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase"><span>Total HT</span><span className="text-slate-900">{totalHT.toFixed(2)} €</span></div>
              {!isExonere && <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase"><span>TVA</span><span className="text-slate-900">{totalTVA.toFixed(2)} €</span></div>}
              {montantAcompte > 0 && <div className="flex justify-between text-[10px] font-bold text-blue-600 uppercase"><span>Acompte</span><span>- {montantAcompte.toFixed(2)} €</span></div>}
              <div className="flex justify-between text-xl font-black text-slate-900 pt-3 border-t border-slate-100 uppercase">
                <span>Net à payer</span>
                <span>{(totalTTC - (docType === 'facture' ? montantAcompte : 0)).toFixed(2)} €</span>
              </div>
              {isExonere && <p className="text-[8px] text-slate-400 italic text-right mt-4 font-bold">TVA non applicable, art. 293 B du CGI</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Wrapper avec Suspense pour permettre l'usage de useSearchParams
export default function NouvelleFacture() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center font-black text-slate-200 text-4xl">CHARGEMENT...</div>}>
      <FormulaireFacture />
    </Suspense>
  )
}