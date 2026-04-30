"use client"
import { useEffect, useState } from 'react'
import { createClerkSupabaseClient } from '../../../lib/supabase/supabase' // On utilise le client Clerk
import { useUser, useSession } from '@clerk/nextjs' // On récupère la session
import Link from 'next/link'

export default function Dashboard() {
  const { user } = useUser()
  const { session } = useSession() // Indispensable pour le RLS
  const [stats, setStats] = useState({ total: 0, count: 0 })
  const [recentFactures, setRecentFactures] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user?.id || !session) return

      // On crée le client authentifié
      const client = createClerkSupabaseClient(session)

      // 1. Récupérer les factures (Le RLS filtrera automatiquement par user_id)
      const { data: factures, error } = await client
        .from('factures')
        .select('montant_ttc, created_at, description, statut') // Mise à jour des colonnes
        .order('created_at', { ascending: false })

      if (error) {
        console.error("Erreur chargement factures:", error)
      } else if (factures) {
        // Calcul du CA Mensuel (uniquement les factures 'payée' du mois en cours)
        const debutMois = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        
        const totalMensuelPaye = factures
          .filter(f => f.statut === 'payée' && f.created_at >= debutMois)
          .reduce((acc, curr) => acc + Number(curr.montant_ttc || 0), 0)

        setStats({ 
          total: totalMensuelPaye, 
          count: factures.length 
        })
        setRecentFactures(factures.slice(0, 5))
      }
      setLoading(false)
    }
    fetchDashboardData()
  }, [user, session])

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">
            Salut, {user?.firstName || 'Chef'} 👋
          </h1>
          <p className="text-slate-500 font-medium mt-1">Voici où en sont vos affaires aujourd'hui.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/nouvelle-facture" className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 text-sm text-center">
            + Nouvelle Facture
          </Link>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">CA Mensuel (Payé)</p>
          <p className="text-4xl font-black text-blue-600 mt-2">{stats.total.toLocaleString()} €</p>
          <div className="mt-4 flex items-center text-green-500 text-sm font-bold">
            <span>↑ Focus mois en cours</span>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Factures émises</p>
          <p className="text-4xl font-black text-slate-800 mt-2">{stats.count}</p>
          <p className="mt-4 text-slate-400 text-sm font-medium">Activité globale</p>
        </div>

        <div className="bg-blue-600 p-8 rounded-[2rem] shadow-xl shadow-blue-100 text-white">
          <p className="text-xs font-black text-blue-200 uppercase tracking-widest">Objectif CA</p>
          <p className="text-4xl font-black mt-2">85%</p>
          <div className="w-full bg-blue-500 h-2 rounded-full mt-6">
            <div className="bg-white h-2 rounded-full w-[85%]"></div>
          </div>
        </div>
      </div>

      {/* Section Listes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h3 className="text-xl font-black text-slate-800 mb-6 text-center md:text-left">Dernières factures</h3>
          <div className="space-y-4">
            {recentFactures.length > 0 ? (
              recentFactures.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-3 rounded-xl shadow-sm text-lg">
                      {f.statut === 'payée' ? '✅' : '📄'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-700 leading-tight">{f.description || "Prestation"}</p>
                      <p className="text-xs text-slate-400 font-medium uppercase">{new Date(f.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  <p className="font-black text-slate-900">{Number(f.montant_ttc).toLocaleString()} €</p>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <p className="text-slate-400 font-medium">Aucune facture pour le moment.</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white">
          <h3 className="text-xl font-black mb-6">Actions rapides</h3>
          <div className="grid grid-cols-2 gap-4">
            <QuickAction icon="👤" label="Ajouter Client" href="/nouveau-client" />
            <QuickAction icon="📊" label="Rapports" href="#" />
            <QuickAction icon="⚙️" label="Réglages" href="#" />
            <QuickAction icon="💬" label="Support" href="#" />
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickAction({ icon, label, href }) {
  return (
    <Link href={href} className="flex flex-col items-center justify-center p-6 bg-slate-800 rounded-3xl hover:bg-blue-600 transition-all group">
      <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">{label}</span>
    </Link>
  )
}