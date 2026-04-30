"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase"; // Ton client supabase

export default function LogoUpload({ currentLogo, userId }) {
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(currentLogo);

  async function handleUpload(e) {
    try {
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Math.random()}.${fileExt}`;
      const filePath = `company-logos/${fileName}`;

      // 1. Upload du fichier vers Supabase Storage
      let { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Récupérer l'URL publique
      const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      // 3. Mettre à jour le profil utilisateur avec la nouvelle URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ logo_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setLogoUrl(publicUrl);
      alert("Logo mis à jour !");
    } catch (error) {
      alert("Erreur lors de l'upload : " + error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-6 bg-slate-50 rounded-[2rem]">
      <label className="text-sm font-black uppercase text-slate-500">Logo de l'entreprise</label>
      
      <div className="relative w-32 h-32 bg-white rounded-2xl shadow-inner flex items-center justify-center overflow-hidden border-2 border-dashed border-slate-200">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <span className="text-slate-300 text-xs text-center p-2">Aucun logo</span>
        )}
      </div>

      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading}
        className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-blue-600 cursor-pointer"
      />
      {uploading && <p className="text-blue-500 text-[10px] font-bold animate-pulse">CHARGEMENT...</p>}
    </div>
  );
}