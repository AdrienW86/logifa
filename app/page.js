"use client"
import { SignInButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  // LOGIQUE : Si l'utilisateur est connecté, on l'envoie direct au dashboard
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  // Pendant que Clerk vérifie la connexion, on peut afficher un petit écran blanc ou un loader
  if (!isLoaded || isSignedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      {/* Header / Logo */}
      <div className="mb-12 text-center">
        <h1 className="text-6xl font-black text-slate-900 tracking-tighter">
          LOGIFA<span className="text-blue-600">.</span>
        </h1>
        <p className="text-slate-500 mt-4 text-lg font-medium">
          La facturation simplifiée pour les indépendants.
        </p>
      </div>

      {/* Carte d'appel à l'action */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 w-full max-w-md text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Bienvenue</h2>
        <p className="text-slate-500 mb-8">
          Connectez-vous pour accéder à vos clients et générer vos factures en un clic.
        </p>
        
        <SignInButton mode="modal">
          <button className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black text-lg hover:bg-black hover:scale-[1.02] transition-all shadow-lg shadow-slate-300">
            Se connecter
          </button>
        </SignInButton>

        <p className="mt-6 text-xs text-slate-400 uppercase tracking-widest font-bold">
          Sécurisé par Clerk
        </p>
      </div>

      {/* Footer minimaliste */}
      <footer className="mt-20 text-slate-400 text-sm font-medium">
        © 2026 Logifa - Tous droits réservés.
      </footer>
    </div>
  );
}