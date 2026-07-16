import { OrganizationProvider } from "@/components/organization-provider";
import { fetchPublicOrganization } from "@/lib/organization";
import { OrganizationLanding } from "../organization-landing";

export const dynamic = "force-dynamic";

type OrganizationPageProps = {
  params: Promise<{
    org: string;
  }>;
};

export default async function OrganizationPage({ params }: Readonly<OrganizationPageProps>) {
  const { org } = await params;
  const organization = await fetchPublicOrganization(org);

  return (
    <OrganizationProvider organization={organization}>
      <OrganizationLanding />
    </OrganizationProvider>
  );
}
