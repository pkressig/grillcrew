import { redirect } from "next/navigation";

export default async function AdminPage({
  params,
}: Readonly<{ params: Promise<{ org: string }> }>) {
  const { org } = await params;
  redirect(`/${org}/admin/planning`);
}
