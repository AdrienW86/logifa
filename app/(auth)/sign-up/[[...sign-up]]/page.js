"use client";

import React, { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!isLoaded) return null;

  // Étape 1 : Créer le compte avec Email et Password
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signUp.create({
        emailAddress,
        password,
      });

      // Envoyer le code de vérification par email
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      
      setPendingVerification(true);
    } catch (err) {
      setError(err.errors[0]?.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  // Étape 2 : Vérifier le code reçu par mail
  const onPressVerify = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === "complete") {
        await setActive({ session: completeSignUp.createdSessionId });
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err.errors[0]?.message || "Code invalide ou expiré");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8 border bg-white p-8 rounded-xl shadow-sm">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {pendingVerification ? "Vérifiez votre email" : "Créer un compte"}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {pendingVerification 
              ? `Un code a été envoyé à ${emailAddress}` 
              : "Commencez à gérer vos factures dès maintenant"}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-200">
            {error}
          </div>
        )}

        {!pendingVerification ? (
          // Formulaire d'inscription classique
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 outline-none"
                  onChange={(e) => setEmailAddress(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
                <input
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 outline-none"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button
              disabled={loading}
              className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Création..." : "S'inscrire"}
            </button>
          </form>
        ) : (
          // Formulaire de saisie du code de vérification
          <form onSubmit={onPressVerify} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 text-center">Code de vérification</label>
              <input
                type="text"
                placeholder="Ex: 123456"
                required
                className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button
              disabled={loading}
              className="w-full bg-green-600 text-white p-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Vérification..." : "Vérifier l'email"}
            </button>
          </form>
        )}

        <div className="text-center">
          <p className="text-sm text-gray-600">
            Vous avez déjà un compte ?{" "}
            <Link href="/sign-in" className="font-medium text-blue-600 hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}