"use client"
import { useEffect, useState } from 'react'
import { createClerkSupabaseClient } from '@/lib/supabase/supabase' // On garde la même méthode que pour l'insertion
import { useUser, useSession } from '@clerk/nextjs'
import Link from 'next/link'

export default function ClientsPage() {
  const { user, isLoaded: userLoaded } = useUser()
  const { session, isLoaded: sessionLoaded } = useSession()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function getClients() {
      // On attend que Clerk soit prêt et que la session soit là
      if (!user || !session) return
      
      try {
        const supabase = createClerkSupabaseClient(session)
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }) // Les plus récents en premier

        if (error) throw error
        setClients(data || [])
      } catch (error) {
        console.error("Erreur chargement clients:", error.message)
      } finally {
        setLoading(false)
      }
    }

    if (userLoaded && sessionLoaded) {
      getClients()
    }
  }, [user, session, userLoaded, sessionLoaded])

  if (!userLoaded || !sessionLoaded || loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Chargement de vos clients...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-slate-800">Clients</h1>
        <Link href="/nouveau-client" className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
          + Nouveau
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="p-6 text-xs font-black text-slate-400 uppercase">Entreprise</th>
              <th className="p-6 text-xs font-black text-slate-400 uppercase hidden md:table-cell">Email</th>
              <th className="p-6 text-xs font-black text-slate-400 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.length > 0 ? (
              clients.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-all">
                  <td className="p-6 font-bold text-slate-700">
                    {c.nom_entreprise || "Sans nom"}
                  </td>
                  <td className="p-6 text-slate-500 hidden md:table-cell">
                    {c.email_contact || "—"}
                  </td>
                  <td className="p-6 text-right">
                    <Link href={`/clients/${c.id}`} className="font-bold text-blue-600 text-sm hover:underline">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="p-12 text-center text-slate-400 italic">
                  Aucun client trouvé. Commencez par en créer un !
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}