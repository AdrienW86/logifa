import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import SignOut from '@/components/Auth/SignOut';
import styles from '@/components/Auth/auth.module.css';
import { adminUserId, clerkIsConfigured } from '@/lib/auth/config';
import { accessStatus } from '@/lib/auth/policy.ts';

export const dynamic = 'force-dynamic';

export default async function AccessDeniedPage() {
  let signedIn = false;
  if (clerkIsConfigured() && adminUserId()) {
    const session = await auth({ acceptsToken: 'session_token' });
    const userId = session.isAuthenticated === false ? null : session.userId;
    if (accessStatus(userId, adminUserId()) === 200) redirect('/');
    signedIn = Boolean(userId);
  }
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.label}>LOGIFA</p>
        <h1>Accès refusé</h1>
        <p>Ce compte ne peut pas accéder à cet espace privé.</p>
        {signedIn ? <SignOut /> : <a href="/sign-in">Retour à la connexion</a>}
      </section>
    </main>
  );
}
