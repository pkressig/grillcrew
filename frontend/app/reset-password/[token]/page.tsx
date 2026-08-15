import { fetchPublicOrganization } from "@/lib/organization";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ org?: string }>;
}>) {
  const { token } = await params;
  const query = await searchParams;
  return (
    <ResetPasswordForm token={token} organization={await fetchPublicOrganization(query?.org)} />
  );
}
