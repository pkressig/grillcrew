import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchPublicOrganizationStrict } from "@/lib/organization";
import { HelpPage } from "../../help-page";

export const dynamic = "force-dynamic";

type HelpPageProps = {
  params: Promise<{
    org: string;
  }>;
};

export async function generateMetadata({ params }: Readonly<HelpPageProps>): Promise<Metadata> {
  const { org } = await params;
  const organization = await fetchPublicOrganizationStrict(org);
  if (!organization) redirect("/vereine");
  return { title: `${organization.name} – Hilfe (Kiosk)` };
}

export default async function OrganizationKioskHelpPage({ params }: Readonly<HelpPageProps>) {
  const { org } = await params;
  const organization = await fetchPublicOrganizationStrict(org);
  if (!organization) redirect("/vereine");

  return <HelpPage organization={organization} shiftType="KIOSK" />;
}
