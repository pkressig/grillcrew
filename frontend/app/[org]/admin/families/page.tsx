import { OrganizationProvider } from "@/components/organization-provider";
import { fetchPublicOrganization } from "@/lib/organization";
import { AdminShell } from "../admin-shell";

export const dynamic = "force-dynamic";

export default async function FamiliesAdminPage({
  params,
}: Readonly<{ params: Promise<{ org: string }> }>) {
  const { org } = await params;
  const organization = await fetchPublicOrganization(org);
  return (
    <OrganizationProvider organization={organization}>
      <AdminShell activeView="families" org={org} organization={organization} />
    </OrganizationProvider>
  );
}
