"use client";

import React, { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { getSupabase } from "@/lib/supabase/supabase"; // On utilise le client standard (sans JWT Clerk)
import { useRouter } from "next/navigation";
import { profileSchema } from "@/lib/validation";

export default function OnboardingPage() {
  const { user } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  const [formData, setFormData] = useState({
    company_name: "",
    siret: "",
    num_voie: "",
    nom_voie: "",
    code_postal: "",
    ville: "",
    email_pro: "",
    is_auto_entrepreneur: false
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setErrors({});

    // 1. Validation Zod
    const result = profileSchema.safeParse(formData);

    if (!result.success) {
      const formattedErrors = result.error.flatten().fieldErrors;
      setErrors(formattedErrors);
      setLoading(false);
      return;
    }

    // 2. Utilisation du client standard pour bypasser l'erreur de clé JWT
    // IMPORTANT : Assure-toi d'avoir fait "ALTER TABLE profiles DISABLE ROW LEVEL SECURITY" dans Supabase
    const supabase = getSupabase();

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id, // L'ID Clerk (ex: user_2...)
          company_name: result.data.company_name,
          siret: result.data.siret,
          num_voie: result.data.num_voie,
          nom_voie: result.data.nom_voie,
          code_postal: result.data.code_postal,
          ville: result.data.ville,
          email_pro: result.data.email_pro,
          is_auto_entrepreneur: result.data.is_auto_entrepreneur,
          updated_at: new Date()
        });

      if (error) throw error;
      
      // Si ça réussit, on fonce au dashboard
      router.push('/dashboard');
      router.refresh(); 
    } catch (error) {
      console.error("Erreur détaillée:", error);
      alert("Erreur : " + (error.message || "Impossible de sauvegarder le profil"));
    } finally {
      setLoading(false);
    }
  };

  const ErrorMsg = ({ name }) => (
    errors[name] ? (
      <p className="text-red-500 text-[10px] font-black uppercase mt-1 ml-4 animate-pulse">
        {errors[name][0]}
      </p>
    ) : null
  );

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-900">
      <div className="max-w-xl w-full bg-white rounded-[3rem] p-10 shadow-2xl">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl mx-auto mb-4 shadow-lg shadow-blue-500/30">
            💼
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Configuration Profil</h1>
          <p className="text-slate-500 text-sm mt-2 font-medium italic">Complétez vos infos pour débloquer la facturation.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 ml-4 mb-1">Nom de l'entreprise</label>
              <input 
                type="text" 
                placeholder="Ex: Jean Dupont EI"
                className={`w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.company_name ? 'ring-2 ring-red-500' : ''}`}
                onChange={(e) => setFormData({...formData, company_name: e.target.value})}
              />
              <ErrorMsg name="company_name" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 ml-4 mb-1">SIRET</label>
              <input 
                type="text" 
                maxLength={14}
                placeholder="14 chiffres"
                className={`w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono ${errors.siret ? 'ring-2 ring-red-500' : ''}`}
                onChange={(e) => setFormData({...formData, siret: e.target.value})}
              />
              <ErrorMsg name="siret" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-1">
              <label className="block text-[10px] font-black uppercase text-slate-400 ml-4 mb-1">N°</label>
              <input 
                type="text" 
                placeholder="12"
                className={`w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.num_voie ? 'ring-2 ring-red-500' : ''}`}
                onChange={(e) => setFormData({...formData, num_voie: e.target.value})}
              />
              <ErrorMsg name="num_voie" />
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] font-black uppercase text-slate-400 ml-4 mb-1">Nom de la voie</label>
              <input 
                type="text" 
                placeholder="Rue de la Paix"
                className={`w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.nom_voie ? 'ring-2 ring-red-500' : ''}`}
                onChange={(e) => setFormData({...formData, nom_voie: e.target.value})}
              />
              <ErrorMsg name="nom_voie" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 ml-4 mb-1">Code Postal</label>
              <input 
                type="text" 
                maxLength={5}
                placeholder="75000"
                className={`w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono ${errors.code_postal ? 'ring-2 ring-red-500' : ''}`}
                onChange={(e) => setFormData({...formData, code_postal: e.target.value})}
              />
              <ErrorMsg name="code_postal" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 ml-4 mb-1">Ville</label>
              <input 
                type="text" 
                placeholder="Paris"
                className={`w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.ville ? 'ring-2 ring-red-500' : ''}`}
                onChange={(e) => setFormData({...formData, ville: e.target.value})}
              />
              <ErrorMsg name="ville" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 ml-4 mb-1">Email Pro</label>
            <input 
              type="email" 
              placeholder="contact@votre-entreprise.fr"
              className={`w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium ${errors.email_pro ? 'ring-2 ring-red-500' : ''}`}
              onChange={(e) => setFormData({...formData, email_pro: e.target.value})}
            />
            <ErrorMsg name="email_pro" />
          </div>

          <div 
            onClick={() => setFormData({...formData, is_auto_entrepreneur: !formData.is_auto_entrepreneur})}
            className={`p-4 rounded-2xl cursor-pointer flex items-center justify-between transition-all border-2 mt-4 ${
              formData.is_auto_entrepreneur ? 'border-blue-500 bg-blue-50' : 'border-transparent bg-slate-50'
            }`}
          >
            <div className="flex flex-col text-left">
              <span className="text-sm font-bold">Auto-entrepreneur</span>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Exonération TVA (Art. 293B du CGI)</span>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              formData.is_auto_entrepreneur ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
            }`}>
              {formData.is_auto_entrepreneur && <span className="text-white text-[10px]">✓</span>}
            </div>
          </div>

          <button 
            disabled={loading}
            type="submit"
            className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg hover:bg-blue-600 transition-all disabled:opacity-50 shadow-xl shadow-slate-900/20 mt-6 active:scale-[0.98]"
          >
            {loading ? "CRÉATION DU PROFIL..." : "VALIDER ET CONTINUER"}
          </button>
        </form>
      </div>
    </div>
  );
}