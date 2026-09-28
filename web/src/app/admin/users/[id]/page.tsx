import type { Metadata } from "next";
import { UserDetailView } from "@/components/admin/user-detail-view";

export const metadata: Metadata = { title: "User" };

export default async function Page({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  return <UserDetailView id={id} />;
}
