"use client"
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClerkSupabaseClient } from '@/lib/supabase/supabase'
import { useUser, useSession } from '@clerk/nextjs'
import { clientSchema } from '@/lib/validation'
import { z } from 'zod'

export default function ModifierClientPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user, isLoaded: userLoaded } = useUser()
  const { session, isLoaded: sessionLoaded } = useSession()

  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  
  const [formData, setFormData] = useState({
    nom_entreprise: '',
    siret: '',
    email_contact: '',
    telephone: '',
    // Champs adresse
    adresse_numero: '',
    adresse_voie: '',
    code_postal: '',
    ville: '',
    // Nouveaux champs facturation
    tva_intracommunautaire: '',
    conditions_reglement: '30_jours'
  })

  // 1. Chargement et pré-remplissage
  useEffect(() => {
    async function loadClient() {
      if (!user || !session || !id) return
      try {
        const supabase = createClerkSupabaseClient(session)
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single()

        if (error) throw error
        if (data) {
          setFormData({
            nom_entreprise: data.nom_entreprise || '',
            siret: data.siret || '',
            email_contact: data.email_contact || '',
            telephone: data.telephone || '',
            adresse_numero: data.adresse_numero || '',
            adresse_voie: data.adresse_voie || '',
            code_postal: data.code_postal || '',
            ville: data.ville || '',
            tva_intracommunautaire: data.tva_intracommunautaire || '',
            conditions_reglement: data.conditions_reglement || '30_jours'
          })
        }
      } catch (error) {
        setMessage({ type: 'error', text: "Erreur de chargement" })
      } finally {
        setLoading(false)
      }
    }
    if (userLoaded && sessionLoaded) loadClient()
  }, [id, user, session, userLoaded, sessionLoaded])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // 2. Mise à jour (Correction de l'enregistrement adresse)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setUpdating(true)
    setMessage({ type: '', text: '' })

    try {
      // ⚠️ IMPORTANT: Vérifie que clientSchema dans lib/validation.js 
      // contient bien adresse_numero, adresse_voie, code_postal et ville
      const validatedData = clientSchema.parse(formData)
      
      const supabase = createClerkSupabaseClient(session)
      const { error } = await supabase
        .from('clients')
        .update(validatedData) 
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) throw error

      setMessage({ type: 'success', text: "✨ Modifications enregistrées !" })
      setTimeout(() => router.push(`/clients/${id}`), 1500)
    } catch (error) {
      if (error instanceof z.ZodError) {
        setMessage({ type: 'error', text: `⚠️ Champ manquant : ${error.errors[0].path[0]}` })
      } else {
        setMessage({ type: 'error', text: "❌ Erreur base de données : " + error.message })
      }
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm("Supprimer définitivement ce client ?")) return
    setUpdating(true)
    try {
      const supabase = createClerkSupabaseClient(session)
      await supabase.from('clients').delete().eq('id', id).eq('user_id', user.id)
      router.push('/clients')
    } catch (error) {
      setMessage({ type: 'error', text: "Erreur lors de la suppression" })
      setUpdating(false)
    }
  }

  if (loading) return <div style={{ padding: '50px', textAlign: 'center', color: '#64748b' }}>Chargement...</div>

  return (
    <div style={containerStyle}>
      <div style={headerActionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => router.back()} style={backBtnStyle}>←</button>
          <h2 style={titleStyle}>Édition Client</h2>
        </div>
        <button onClick={handleDelete} style={deleteBtnStyle}>Supprimer</button>
      </div>
      
      <form onSubmit={handleSubmit} style={formStyle}>
        {/* SECTION 1 : IDENTITÉ */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Identité & Légal</label>
          <input name="nom_entreprise" value={formData.nom_entreprise} onChange={handleChange} placeholder="Nom de l'entreprise *" style={inputStyle} required />
          <input name="siret" value={formData.siret} onChange={handleChange} placeholder="SIRET" style={inputStyle} />
          <input name="tva_intracommunautaire" value={formData.tva_intracommunautaire} onChange={handleChange} placeholder="N° TVA Intracommunautaire" style={inputStyle} />
        </div>

        {/* SECTION 2 : ADRESSE (Bien vérifier les 'name') */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Adresse de facturation</label>
          <div style={rowStyle}>
            <input name="adresse_numero" value={formData.adresse_numero} onChange={handleChange} placeholder="N°" style={{...inputStyle, width: '70px'}} required />
            <input name="adresse_voie" value={formData.adresse_voie} onChange={handleChange} placeholder="Voie (Rue, Avenue...)" style={{...inputStyle, flex: 1}} required />
          </div>
          <div style={rowStyle}>
            <input name="code_postal" value={formData.code_postal} onChange={handleChange} placeholder="Code Postal" style={{...inputStyle, width: '120px'}} required />
            <input name="ville" value={formData.ville} onChange={handleChange} placeholder="Ville" style={{...inputStyle, flex: 1}} required />
          </div>
        </div>

        {/* SECTION 3 : CONTACT & PAIEMENT */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Contact & Règlement</label>
          <div style={rowStyle}>
            <input name="email_contact" value={formData.email_contact} onChange={handleChange} placeholder="Email" style={{...inputStyle, flex: 1}} />
            <input name="telephone" value={formData.telephone} onChange={handleChange} placeholder="Téléphone" style={{...inputStyle, flex: 1}} />
          </div>
          <select name="conditions_reglement" value={formData.conditions_reglement} onChange={handleChange} style={inputStyle}>
            <option value="reception">À réception</option>
            <option value="15_jours">15 jours</option>
            <option value="30_jours">30 jours</option>
            <option value="45_fin_de_mois">45 jours fin de mois</option>
          </select>
        </div>
        
        <button type="submit" disabled={updating} style={{...buttonStyle, backgroundColor: updating ? '#666' : '#000'}}>
          {updating ? 'Enregistrement...' : 'Mettre à jour le client'}
        </button>
      </form>

      {message.text && (
        <div style={{ ...messageBoxStyle, backgroundColor: message.type === 'error' ? '#fee2e2' : '#f0fdf4', color: message.type === 'error' ? '#991b1b' : '#166534', border: message.type === 'error' ? '1px solid #fca5a5' : '1px solid #bbf7d0' }}>
          {message.text}
        </div>
      )}
    </div>
  )
}

// --- STYLES ---
const containerStyle = { maxWidth: '550px', margin: '40px auto', padding: '30px', backgroundColor: '#fff', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }
const headerActionStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }
const titleStyle = { fontSize: '22px', fontWeight: '900', color: '#0f172a', margin: 0 }
const formStyle = { display: 'flex', flexDirection: 'column', gap: '25px' }
const sectionStyle = { display: 'flex', flexDirection: 'column', gap: '10px' }
const labelStyle = { fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }
const rowStyle = { display: 'flex', gap: '12px' }
const inputStyle = { padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', backgroundColor: '#f8fafc' }
const buttonStyle = { padding: '16px', color: '#fff', cursor: 'pointer', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: 'bold', marginTop: '10px' }
const backBtnStyle = { background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }
const deleteBtnStyle = { background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }
const messageBoxStyle = { marginTop: '25px', padding: '14px', borderRadius: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }