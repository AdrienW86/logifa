"use client";

import React, { useState, useEffect } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { getSupabase } from "@/lib/supabase/supabase";
import { profileSchema } from "@/lib/validation";

export default function SettingsPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: "", msg: "" });
  
  const [formData, setFormData] = useState({
    company_name: "",
    siret: "",
    num_voie: "",
    nom_voie: "",
    code_postal: "",
    ville: "",
    email_pro: "",
    logo_url: "",
    is_auto_entrepreneur: false
  });

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      const supabase = getSupabase();
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) setFormData(data);
    }
    loadProfile();
  }, [user]);

  // FONCTION POUR L'UPLOAD DU LOGO
  const handleLogoUpload = async (e) => {
    try {
      setUploading(true);
      const file = e.target.files[0];
      if (!file) return;

      const supabase = getSupabase();
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Upload vers le bucket 'logos'
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Récupérer l'URL publique
      const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
      
      setFormData({ ...formData, logo_url: data.publicUrl });
      setStatus({ type: "success", msg: "Logo chargé ! N'oubliez pas de sauvegarder." });
    } catch (error) {
      setStatus({ type: "error", msg: "Erreur upload : " + error.message });
    } finally {
      setUploading(false);
      setTimeout(() => setStatus({ type: "", msg: "" }), 3000);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Validation avec Zod
    const result = profileSchema.safeParse(formData);
    if (!result.success) {
      setStatus({ type: "error", msg: "Vérifiez tous les champs." });
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    const { error } = await supabase.from('profiles').upsert({ 
      id: user.id, 
      ...result.data, 
      updated_at: new Date() 
    });

    setLoading(false);
    if (error) setStatus({ type: "error", msg: error.message });
    else {
      setStatus({ type: "success", msg: "Profil mis à jour avec succès !" });
      setTimeout(() => setStatus({ type: "", msg: "" }), 3000);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-10">
      <header className="mb-10">
        <h1 className="text-3xl font-black uppercase text-slate-900 tracking-tighter">Paramètres</h1>
        <p className="text-slate-500 italic text-sm font-medium">Configuration de votre identité visuelle et légale.</p>
      </header>

      {status.msg && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full font-bold shadow-2xl animate-in fade-in zoom-in duration-300 ${
          status.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
        }`}>
          {status.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <div className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-xl shadow-slate-200/50 border border-slate-100">
            
            <form onSubmit={handleUpdateProfile} className="space-y-8">
              
              {/* SECTION LOGO */}
              <div className="flex flex-col md:flex-row items-center gap-8 p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <div className="relative w-32 h-32 bg-white rounded-2xl shadow-inner flex items-center justify-center overflow-hidden border border-slate-100">
                  {formData.logo_url ? (
                    <img src={formData.logo_url} alt="Logo preview" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-slate-300 text-[10px] font-black uppercase text-center p-2">Aucun logo</span>
                  )}
                  {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-blue-600 font-bold text-[10px] animate-pulse">Chargement...</div>}
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="text-sm font-black uppercase text-slate-900">Logo de l'établissement</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Format PNG ou JPG recommandé. Le logo apparaîtra sur toutes vos factures et devis.</p>
                  <input 
                    type="file" 
                    onChange={handleLogoUpload} 
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-slate-900 file:text-white hover:file:bg-blue-600 file:cursor-pointer cursor-pointer" 
                  />
                </div>
              </div>

              {/* IDENTITÉ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nom de l'établissement</label>
                  <input 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-medium"
                    value={formData.company_name}
                    onChange={e => setFormData({...formData, company_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Numéro SIRET</label>
                  <input 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-mono"
                    value={formData.siret}
                    onChange={e => setFormData({...formData, siret: e.target.value})}
                  />
                </div>
              </div>

              {/* EMAIL */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Email de facturation professionnel</label>
                <input 
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all"
                  value={formData.email_pro}
                  onChange={e => setFormData({...formData, email_pro: e.target.value})}
                />
              </div>

              {/* ADRESSE - LIGNE 1 */}
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1 space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">N°</label>
                  <input 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all"
                    value={formData.num_voie}
                    onChange={e => setFormData({...formData, num_voie: e.target.value})}
                  />
                </div>
                <div className="col-span-3 space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nom de la Voie</label>
                  <input 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all"
                    value={formData.nom_voie}
                    onChange={e => setFormData({...formData, nom_voie: e.target.value})}
                  />
                </div>
              </div>

              {/* ADRESSE - LIGNE 2 (CP / VILLE) */}
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1 space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Code Postal</label>
                  <input 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all"
                    value={formData.code_postal}
                    onChange={e => setFormData({...formData, code_postal: e.target.value})}
                  />
                </div>
                <div className="col-span-3 space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Ville</label>
                  <input 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all"
                    value={formData.ville}
                    onChange={e => setFormData({...formData, ville: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-blue-600 hover:shadow-blue-500/20 hover:shadow-2xl transition-all disabled:opacity-50 active:scale-95"
              >
                {loading ? "Sauvegarde en cours..." : "Enregistrer le profil"}
              </button>
            </form>
          </div>
        </div>

        {/* SECTION SÉCURITÉ */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white h-fit relative overflow-hidden shadow-2xl">
            <div className="relative z-10">
              <h2 className="text-xl font-black uppercase mb-6 flex items-center gap-3">
                <span className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center text-white text-lg">🔐</span>
                Sécurité
              </h2>
              
              <div className="space-y-4">
                <div className="p-5 bg-white/5 rounded-3xl border border-white/10">
                  <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-wider">Identifiants Clerk</p>
                  <div className="flex items-center gap-4">
                    <UserButton afterSignOutUrl="/" showName appearance={{
                      elements: {
                        userButtonBox: "flex-row-reverse gap-4",
                        userButtonOuterIdentifier: "text-white font-bold"
                      }
                    }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-600/20 blur-[80px] rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}