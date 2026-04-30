import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Instances mémorisées
let supabaseStandard = null;
let supabaseAuthenticated = null;

// Pour les requêtes publiques (si besoin)
export const getSupabase = () => {
  if (!supabaseStandard) {
    supabaseStandard = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseStandard;
};

// LA VERSION CORRIGÉE POUR CLERK
export const createClerkSupabaseClient = (session) => {
  // Si on a déjà une instance authentifiée, on la renvoie
  if (supabaseAuthenticated) return supabaseAuthenticated;

  // Sinon, on la crée UNE SEULE FOIS
  supabaseAuthenticated = createClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: async (url, options = {}) => {
        // Le token est récupéré dynamiquement à chaque fetch, 
        // donc l'instance reste valable même si le token expire
        const clerkToken = await session.getToken({ template: 'supabase' });
        
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${clerkToken}`);
        
        return fetch(url, { ...options, headers });
      },
    },
  });

  return supabaseAuthenticated;
};