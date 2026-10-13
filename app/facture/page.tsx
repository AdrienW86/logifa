"use client";
import { useUser } from "@clerk/nextjs";
import DocumentEditor from "../../components/Editor/DocumentEditor";
export default function Page() {
  const { user } = useUser();
  return <DocumentEditor kind="facture" storageScope={user?.id} />;
}
