import { z } from "zod";

// --- SCHEMA PROFIL ---
export const profileSchema = z.object({
  company_name: z.string().min(2, "Nom d'entreprise requis"),
  siret: z.string().length(14, "Le SIRET doit faire exactement 14 chiffres"),
  num_voie: z.string().min(1, "N° requis"),
  nom_voie: z.string().min(2, "Nom de rue requis"),
  code_postal: z.string().regex(/^\d{5}$/, "Code postal invalide (5 chiffres)"),
  ville: z.string().min(2, "Ville requise"),
  email_pro: z.string().email("Email professionnel invalide"),
  is_auto_entrepreneur: z.boolean().default(false),
});

// --- SCHEMA CLIENT (CORRIGÉ) ---
export const clientSchema = z.object({
  nom_entreprise: z.string().min(2, "Le nom du client est trop court"),
  email_contact: z.string().email("Email invalide").or(z.literal("")),
  telephone: z.string().optional().or(z.literal("")),
  siret: z.string().length(14, "Le SIRET doit faire 14 chiffres").optional().or(z.literal("")),
  
  // AJOUT DES CHAMPS ADRESSE POUR LA MISE À JOUR
  adresse_numero: z.string().min(1, "N° de voie requis"),
  adresse_voie: z.string().min(2, "Nom de voie requis"),
  code_postal: z.string().min(5, "Code postal requis"),
  ville: z.string().min(2, "Ville requise"),

  // AJOUT DES CHAMPS FACTURATION
  tva_intracommunautaire: z.string().optional().or(z.literal("")),
  conditions_reglement: z.string().optional().default("30_jours"),
});

// --- SCHEMA FACTURE ---
export const factureSchema = z.object({
  client_id: z.string().uuid("Veuillez sélectionner un client"),
  description: z.string().min(5, "La description est trop courte"),
  montant: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number({ invalid_type_error: "Le montant doit être un nombre" })
     .positive("Le montant doit être supérieur à 0")
  ),
  date_echeance: z.string().min(1, "La date d'échéance est requise"),
});