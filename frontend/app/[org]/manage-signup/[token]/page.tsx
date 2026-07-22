import { OrganizationProvider } from "@/components/organization-provider";
import { fetchPublicOrganization } from "@/lib/organization";
import { ManagedSignupPage } from "./managed-signup-page";

export const dynamic = "force-dynamic";

export default async function SignupManagementRoute({
  params,
}: Readonly<{ params: Promise<{ org: string; token: string }> }>) {
  const { org, token } = await params;
  const organization = await fetchPublicOrganization(org);
  return (
    <OrganizationProvider organization={organization}>
      <ManagedSignupPage token={token} />
    </OrganizationProvider>
  );
}
