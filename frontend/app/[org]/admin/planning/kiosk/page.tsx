import { OrganizationProvider } from "@/components/organization-provider";
import { fetchPublicOrganization } from "@/lib/organization";
import { AdminShell } from "../../admin-shell";

export const dynamic = "force-dynamic";
export default async function KioskPlanningPage({
  params,
}: Readonly<{ params: Promise<{ org: string }> }>) {
  const { org } = await params;
  const organization = await fetchPublicOrganization(org);
  return (
    <OrganizationProvider organization={organization}>
      <AdminShell
        activeView="planning"
        planningSection="kiosk"
        org={org}
        organization={organization}
      />
    </OrganizationProvider>
  );
}
