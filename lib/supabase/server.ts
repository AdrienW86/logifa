import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import { AdminAccessError, requireAdmin } from '../auth/require-admin.ts';

export async function databaseForAdmin() {
  const authorizedId = await requireAdmin();
  if (process.env.LOGIFA_PERSISTENCE_ENABLED !== 'true') throw new Error('PERSISTENCE_NOT_ENABLED');
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const expectedProject = process.env.LOGIFA_SUPABASE_PROJECT_REF?.trim() ?? 'bniitcbsaowwzkjdrqwz';
  if (!/^[a-z0-9]{20}$/.test(expectedProject) || url !== `https://${expectedProject}.supabase.co` || !key?.startsWith('sb_publishable_')) throw new Error('PERSISTENCE_CONFIGURATION_REQUIRED');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => {
      const session = await auth({ acceptsToken: 'session_token' });
      if (session.userId !== authorizedId || !session.isAuthenticated) throw new AdminAccessError(401);
      const token = await session.getToken();
      if (!token) throw new AdminAccessError(401);
      return token;
    },
  });
}
