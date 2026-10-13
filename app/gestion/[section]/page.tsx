import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import Workspace, { type Section } from "@/components/Workspace/Workspace";
const sections: Section[] = [
  "entreprises",
  "clients",
  "devis",
  "factures",
  "paiements",
  "documents",
  "parametres",
];
function isSection(value: string): value is Section {
  return sections.some((section) => section === value);
}
export default async function ManagementPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  await requireAdminPage();
  const { section } = await params;
  if (!isSection(section)) notFound();
  return <Workspace section={section} />;
}
