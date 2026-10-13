import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { accessStatus } from './policy.ts';
import { adminUserId, clerkIsConfigured } from './config';

export class AdminAccessError extends Error {
  readonly status: 401 | 403 | 503;
  constructor(status: 401 | 403 | 503) {
    super('Accès non autorisé');
    this.status = status;
  }
}

// Call at the start of every server action and sensitive server operation.
export async function requireAdmin() {
  if (!clerkIsConfigured() || !adminUserId()) throw new AdminAccessError(503);
  const session = await auth({ acceptsToken: 'session_token' });
  const userId = session.isAuthenticated === false ? null : session.userId;
  const status = accessStatus(userId, adminUserId());
  if (status !== 200) throw new AdminAccessError(status);
  if (!userId) throw new AdminAccessError(401);
  return userId;
}

export async function requireAdminPage() {
  try {
    return await requireAdmin();
  } catch (error) {
    if (!(error instanceof AdminAccessError)) throw error;
    redirect(error.status === 403 ? '/access-denied' : '/sign-in');
  }
}

// Use for each future API handler, in addition to the global proxy.
export function withAdminApi<Args extends unknown[], Result>(handler: (...args: Args) => Result) {
  return async (...args: Args) => {
    try {
      await requireAdmin();
    } catch (error) {
      if (!(error instanceof AdminAccessError)) throw error;
      return Response.json({ error: 'Accès non autorisé' }, {
        status: error.status,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    return handler(...args);
  };
}
