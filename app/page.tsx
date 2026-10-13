import { requireAdminPage } from "@/lib/auth/require-admin";
import Workspace from "@/components/Workspace/Workspace";

export default async function Home() {
  await requireAdminPage();
  return <Workspace section="dashboard" />;
}
