"use client"
import { useState } from 'react'
import { createClerkSupabaseClient } from '../../../lib/supabase/supabase'
import { useUser, useSession } from '@clerk/nextjs'
import { clientSchema } from '../../../lib/validation' 
import { z } from 'zod'

export default function NouveauClient() {
  const { user, isLoaded } = useUser()
  const { session } = useSession()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user || !session) return
    
    setLoading(true)
    setMessage({ type: '', text: '' })

    const formData = new FormData(e.currentTarget)
    
    // 1. Préparation des données
    const rawData = {
      nom_entreprise: formData.get('nom_complet'),
      email_contact: formData.get('email') || "", 
      telephone: formData.get('telephone') || "",
      siret: formData.get('siret') || "",
      adresse_numero: formData.get('adresse_numero'),
      adresse_voie: formData.get('adresse_voie'),
      code_postal: formData.get('code_postal'),
      ville: formData.get('ville'),
    }

    try {
      // 2. Validation avec Zod
      const validatedData = clientSchema.parse(rawData)

      const supabase = createClerkSupabaseClient(session)

      // 3. Insertion dans Supabase
      const { error } = await supabase
        .from('clients')
        .insert([
          { 
            ...validatedData, 
            user_id: user.id    
          }
        ])

      if (error) throw error

      setMessage({ type: 'success', text: "✨ Client enregistré avec succès !" })

      if (e.target) {
    e.target.reset();
  }
    } catch (error) {
      // 4. Gestion des erreurs
      if (error instanceof z.ZodError) {
        setMessage({ type: 'error', text: `⚠️ ${error.errors[0].message}` })
      } else {
        setMessage({ type: 'error', text: "❌ Erreur : " + error.message })
      }
    } finally {
      setLoading(false)
    }
  }

  if (!isLoaded) return <p>Chargement...</p>

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>➕ Nouveau Client</h2>
      
      <form onSubmit={handleSubmit} style={formStyle}>
        <div style={sectionStyle}>
          <label style={labelStyle}>Identité</label>
          <input name="nom_complet" placeholder="Nom de l'entreprise ou du client *" style={inputStyle} required />
          <input name="siret" placeholder="SIRET (14 chiffres)" style={inputStyle} />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Contact (Optionnel)</label>
          <div style={rowStyle}>
            <input name="email" type="text" placeholder="Email" style={{...inputStyle, flex: 1}} />
            <input name="telephone" placeholder="Téléphone" style={{...inputStyle, flex: 1}} />
          </div>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Adresse de facturation</label>
          <div style={rowStyle}>
            <input name="adresse_numero" placeholder="N°" style={{...inputStyle, width: '60px'}} required />
            <input name="adresse_voie" placeholder="Nom de la voie" style={{...inputStyle, flex: 1}} required />
          </div>
          <div style={rowStyle}>
            <input name="code_postal" placeholder="Code Postal" style={{...inputStyle, width: '120px'}} required />
            <input name="ville" placeholder="Ville" style={{...inputStyle, flex: 1}} required />
          </div>
        </div>
        
        <button type="submit" disabled={loading} style={{...buttonStyle, backgroundColor: loading ? '#666' : '#000'}}>
          {loading ? 'Enregistrement...' : 'Enregistrer le client'}
        </button>
      </form>

      {message.text && (
        <div style={{ 
          ...messageBoxStyle, 
          backgroundColor: message.type === 'error' ? '#fee2e2' : '#f0fdf4', 
          color: message.type === 'error' ? '#991b1b' : '#166534',
          border: message.type === 'error' ? '1px solid #fca5a5' : '1px solid #bbf7d0'
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}

// --- STYLES ---
const containerStyle = { maxWidth: '500px', margin: '40px auto', padding: '20px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }
const titleStyle = { fontSize: '24px', fontWeight: '900', marginBottom: '25px', color: '#1a1a1a' }
const formStyle = { display: 'flex', flexDirection: 'column', gap: '20px' }
const sectionStyle = { display: 'flex', flexDirection: 'column', gap: '10px' }
const labelStyle = { fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }
const rowStyle = { display: 'flex', gap: '10px' }
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none' }
const buttonStyle = { padding: '15px', color: '#fff', cursor: 'pointer', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', marginTop: '10px', transition: 'all 0.2s' }
const messageBoxStyle = { marginTop: '20px', padding: '12px', borderRadius: '8px', textAlign: 'center', fontSize: '14px', fontWeight: '500' }