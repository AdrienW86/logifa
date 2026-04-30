"use client"

import Link from 'next/link'
import { UserButton, useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { getSupabase } from "@/lib/supabase/supabase"
import { useRouter, usePathname } from "next/navigation"
import LogoutButton from "@/components/LogoutButton"
import { Menu, X } from "lucide-react"

export default function DashboardLayout({ children }) {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const [isProfileChecking, setIsProfileChecking] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    async function checkProfile() {
      if (!isLoaded || !user) return
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('profiles')
          .select('company_name')
          .eq('id', user.id)
          .single()

        if ((!data || !data.company_name) && pathname !== '/onboarding') {
          router.push('/onboarding')
        } else {
          setIsProfileChecking(false)
        }
      } catch (err) {
        console.error("Erreur check profile:", err)
        setIsProfileChecking(false)
      }
    }
    checkProfile()
  }, [user, isLoaded, pathname, router])

  if (!isLoaded || isProfileChecking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Chargement Logifa...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 font-sans">
      
      {/* HEADER MOBILE */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-xs">L</div>
          <span className="font-black tracking-tighter">LOGIFA</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* SIDEBAR */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out
        md:sticky md:top-0 md:translate-x-0 md:h-screen
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        
        <div className="hidden md:flex p-8 text-2xl font-black tracking-tighter border-b border-slate-800 items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm text-white">L</div>
          <span className="text-blue-400">LOGIFA</span>
        </div>

        <div className="md:hidden flex justify-end p-4">
            <button onClick={() => setIsMobileMenuOpen(false)}><X size={24}/></button>
        </div>
        
        <nav className="p-4 flex flex-col gap-2 flex-1 overflow-y-auto">
          <NavLink href="/dashboard" active={pathname === '/dashboard'}>📈 Stats</NavLink>
          <NavLink href="/clients" active={pathname === '/clients'}>👥 Clients</NavLink>
          <NavLink href="/nouvelle-facture" active={pathname === '/nouvelle-facture'}>📝 Nouveau document</NavLink>
          <NavLink href="/devis" active={pathname === '/devis'}>📄 Devis</NavLink>
          <NavLink href="/factures" active={pathname === '/factures'}>💰 Factures</NavLink>
          <NavLink href="/settings" active={pathname === '/settings'}>⚙️ Paramètres</NavLink>
        </nav>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-4">
          <div className="flex items-center gap-3 px-2 py-2">
            <UserButton afterSignOutUrl="/" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-white leading-none truncate">
                {user.firstName || "Mon Profil"}
              </span>
              <span className="text-[10px] font-medium text-slate-500 truncate">
                {user.primaryEmailAddress.emailAddress}
              </span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* CONTENU PRINCIPAL */}
      {/* 
        Le secret est ici : min-h-screen sur le main et bg-slate-50 
        pour s'assurer que la couleur de fond descend jusqu'en bas.
      */}
      <main className="flex-1 p-4 md:p-10 lg:p-16 min-h-screen bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-8 border-b border-slate-200 pb-4">
             <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
               Session active : {user.firstName}
             </span>
          </div>
          {children}
        </div>
      </main>

      {/* OVERLAY MOBILE */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
    </div>
  )
}

function NavLink({ href, children, active }) {
  return (
    <Link 
      href={href} 
      className={`px-4 py-3 rounded-2xl transition-all text-sm font-bold whitespace-nowrap flex items-center gap-3 ${
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
          : "text-slate-400 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {children}
    </Link>
  )
}