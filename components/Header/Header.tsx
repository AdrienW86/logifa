import React from "react";
import Link from "next/link";
import styles from "./header.module.css";
import { auth } from "@clerk/nextjs/server";
import { adminUserId, clerkIsConfigured } from "@/lib/auth/config";
import { accessStatus } from "@/lib/auth/policy.ts";
import SignOut from "@/components/Auth/SignOut";
import IssuerSelector from "@/components/Workspace/IssuerSelector";

export default async function Header() {
  if (!clerkIsConfigured() || !adminUserId()) return null;
  const session = await auth({ acceptsToken: "session_token" });
  const userId = session.isAuthenticated === false ? null : session.userId;
  if (accessStatus(userId, adminUserId()) !== 200) return null;
  return (
    <header className={styles.header} data-logifa-header>
      <Link className={styles.logo} href="/">
        <img src="/icon.svg" width={80} height={80} alt="Logo Logifa" />
        <p className={styles.logifa}> Logifa </p>
      </Link>
      <nav className={styles.nav}>
        <Link href="/gestion/clients" className={styles.link}>
          Gestion
        </Link>
        <Link href="/facture" className={styles.link}>
          {" "}
          Facture
        </Link>
        <Link href="/devis" className={styles.link}>
          {" "}
          Devis
        </Link>
        <SignOut />
      </nav>
      <IssuerSelector />
    </header>
  );
}
