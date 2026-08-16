import type { Metadata } from "next";
import { OrganizationProvider } from "@/components/organization-provider";
import { fetchPublicOrganization } from "@/lib/organization";
import { OrganizationLanding } from "../../organization-landing";

export const dynamic = "force-dynamic";

type OrganizationPageProps = {
  params: Promise<{
    org: string;
  }>;
};

export async function generateMetadata({
  params,
}: Readonly<OrganizationPageProps>): Promise<Metadata> {
  const { org } = await params;
  const organization = await fetchPublicOrganization(org);
  return { title: `${organization.name} – Kiosk Helfer Einsatzplan` };
}

export default async function OrganizationKioskPage({ params }: Readonly<OrganizationPageProps>) {
  const { org } = await params;
  const organization = await fetchPublicOrganization(org);

  return (
    <OrganizationProvider organization={organization}>
      <OrganizationLanding shiftType="KIOSK" />
    </OrganizationProvider>
  );
}
