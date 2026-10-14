import { requireAdminPage } from "@/lib/auth/require-admin";
import { redirect } from "next/navigation";
export default async function Home() {
  await requireAdminPage();
  redirect("/gestion/entreprises");
}
