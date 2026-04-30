"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const { signOut } = useClerk();
  const router = useRouter();

  const handleLogout = async () => {
    // On peut ajouter une confirmation si on veut
    const confirm = window.confirm("Voulez-vous vraiment vous déconnecter ?");
    if (!confirm) return;

    await signOut();
    router.push("/sign-in");
  };

  return (
    <button 
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-3 w-full text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all font-bold group"
    >
      <span className="text-xl group-hover:scale-110 transition-transform">🚪</span>
      <span className="text-sm uppercase tracking-widest font-black">Déconnexion</span>
    </button>
  );
}