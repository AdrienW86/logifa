"use client"
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClerkSupabaseClient } from '@/lib/supabase/supabase'
import { useUser, useSession } from '@clerk/nextjs'
import Link from 'next/link'

export default function ClientDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user, isLoaded: userLoaded } = useUser()
  const { session, isLoaded: sessionLoaded } = useSession()
  
  const [client, setClient] = useState(null)
  const [factures, setFactures] = useState([]) // État pour les factures
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!user || !session || !id) return
      
      try {
        const supabase = createClerkSupabaseClient(session)
        
        // 1. Charger les détails du client
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single()

        if (clientError) throw clientError
        setClient(clientData)

        // 2. Charger les factures liées au client
        const { data: facturesData, error: facturesError } = await supabase
          .from('factures')
          .select('*')
          .eq('client_id', id)
          .order('created_at', { ascending: false })

        if (facturesError) throw facturesError
        setFactures(facturesData || [])

      } catch (error) {
        console.error("Erreur:", error.message)
      } finally {
        setLoading(false)
      }
    }

    if (userLoaded && sessionLoaded) {
      fetchData()
    }
  }, [id, user, session, userLoaded, sessionLoaded])

  // Calcul du total facturé (pour la carte bleue)
  const totalFacture = factures.reduce((acc, curr) => acc + (curr.total_ttc || 0), 0)

  if (!userLoaded || !sessionLoaded || loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Chargement des données...</div>
  }

  if (!client) return <div className="p-10 text-center text-red-500">Client introuvable.</div>

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500">
            ←
          </button>
          <h1 className="text-2xl md:text-4xl font-black text-slate-800 tracking-tight">{client.nom_entreprise}</h1>
        </div>
        <div className="hidden md:block text-xs font-bold text-slate-400 bg-slate-100 px-4 py-2 rounded-full uppercase tracking-widest">
          ID: {client.id.slice(0, 8)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLONNE GAUCHE (Infos + Liste Factures) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Section Infos */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Contact & Légal</h2>
              <div className="space-y-4">
                <InfoItem label="Email" value={client.email_contact} />
                <InfoItem label="Téléphone" value={client.telephone} />
                <InfoItem label="SIRET" value={client.siret} />
              </div>
            </div>
            <div className="space-y-6">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Siège Social</h2>
              <p className="text-slate-600 font-semibold leading-relaxed">
                {client.adresse_numero} {client.adresse_voie}<br />
                {client.code_postal} {client.ville}
              </p>
            </div>
          </div>

          {/* LISTE DES FACTURES (MODERNE) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-black text-slate-800">Historique des factures</h2>
              <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full">
                {factures.length} documents
              </span>
            </div>

            {factures.length > 0 ? (
              <div className="grid gap-4">
                {factures.map((f) => (
                  <div key={f.id} className="group bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-sm">
                        FAC
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{f.numero_facture}</p>
                        <p className="text-xs text-slate-400 font-medium">{new Date(f.date_emission).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-800">{(f.total_ttc || 0).toLocaleString()} €</p>
                      <span className={`text-[10px] uppercase font-black px-2 py-1 rounded-md ${
                        f.statut === 'payée' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {f.statut || 'Brouillon'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[2rem] text-center">
                <p className="text-slate-400 font-medium">Aucune facture pour le moment.</p>
              </div>
            )}
          </div>
        </div>

        {/* COLONNE DROITE (Actions) */}
        <div className="space-y-6">
          <div className="bg-blue-600 p-8 rounded-[2.5rem] shadow-xl shadow-blue-100 text-white relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="font-bold text-blue-100 text-xs uppercase tracking-widest mb-2">Total facturé</h3>
              <p className="text-4xl font-black">{totalFacture.toLocaleString()} €</p>
              <Link 
                href={`/nouvelle-facture?client=${client.id}`}
                className="mt-8 w-full bg-white text-blue-600 py-4 rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <span>+</span> Créer une facture
              </Link>
            </div>
            {/* Déco d'arrière-plan */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>
          
          <div className="bg-white p-4 rounded-[2rem] border border-slate-200/60 space-y-3">
             <Link 
              href={`/clients/${client.id}/modifier`} 
              className="w-full block text-center bg-slate-50 text-slate-600 py-4 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all"
            >
              Modifier le profil
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// Sous-composant pour plus de clarté
function InfoItem({ label, value }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">{label}</label>
      <p className="text-slate-700 font-bold">{value || "—"}</p>
    </div>
  )
}