'use client';

import { useClerk } from '@clerk/nextjs';
import styles from './auth.module.css';

export default function SignOut() {
  const { signOut } = useClerk();
  return (
    <button className={styles.signOut} onClick={() => signOut({ redirectUrl: '/sign-in' })}>
      Se déconnecter
    </button>
  );
}
