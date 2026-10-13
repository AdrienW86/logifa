import type { ReactNode } from "react";
import { requireAdminPage } from '@/lib/auth/require-admin';

export default async function DevisLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return children;
}
