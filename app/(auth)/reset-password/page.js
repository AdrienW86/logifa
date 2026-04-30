"use client";

import React, { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [successfulCreation, setSuccessfulCreation] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!isLoaded) return null;

  // 1. Demander le code par email
  async function create(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setSuccessfulCreation(true);
    } catch (err) {
      setError("Email introuvable ou erreur technique.");
    } finally {
      setLoading(false);
    }
  }

  // 2. Valider le code ET changer le mot de passe
  async function reset(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password, // On définit le nouveau pass ici
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err.errors[0].longMessage || "Code invalide.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background decoratif */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
            {!successfulCreation ? "Mot de passe oublié" : "Nouveau mot de passe"}
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            {!successfulCreation 
              ? "Entrez votre email pour recevoir un code" 
              : `Code envoyé à ${email}`}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 text-[10px] font-black uppercase rounded-2xl text-center">
            ⚠️ {error}
          </div>
        )}

        {!successfulCreation ? (
          <form onSubmit={create} className="space-y-4">
            <input
              type="email"
              placeholder="votre@email.com"
              required
              className="w-full p-4 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button 
              disabled={loading}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              {loading ? "Chargement..." : "Envoyer le code"}
            </button>
          </form>
        ) : (
          <form onSubmit={reset} className="space-y-4">
            <input
              type="text"
              placeholder="Code de vérification"
              required
              className="w-full p-4 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-center tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe"
              required
              className="w-full p-4 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button 
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all disabled:opacity-50"
            >
              {loading ? "Validation..." : "Réinitialiser"}
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
          <Link href="/sign-in" className="text-[10px] font-black uppercase text-slate-400 hover:text-blue-600">
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}