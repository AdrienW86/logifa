import { SignIn } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { adminUserId, clerkIsConfigured } from '@/lib/auth/config';
import { accessStatus } from '@/lib/auth/policy.ts';
import styles from '@/components/Auth/auth.module.css';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const configured = clerkIsConfigured() && Boolean(adminUserId());
  if (configured) {
    const session = await auth({ acceptsToken: 'session_token' });
    const userId = session.isAuthenticated === false ? null : session.userId;
    if (userId) redirect(accessStatus(userId, adminUserId()) === 200 ? '/' : '/access-denied');
  }
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.label}>LOGIFA</p>
        <h1>Connexion privée</h1>
        <p>Accédez à votre espace de gestion des devis et factures.</p>
        {configured ? (
          <SignIn routing="path" path="/sign-in" forceRedirectUrl="/" withSignUp={false}
            appearance={{ elements: { rootBox: { width: '100%' }, cardBox: { width: '100%' } } }} />
        ) : <p role="status">La connexion est temporairement indisponible.</p>}
      </section>
    </main>
  );
}
