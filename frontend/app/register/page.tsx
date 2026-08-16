import { fetchPublicOrganization } from "@/lib/organization";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ org?: string; shift?: string; area?: string }>;
}) {
  const params = await searchParams;
  return (
    <RegisterForm
      organization={await fetchPublicOrganization(params?.org)}
      pendingShiftId={params?.shift ?? null}
      area={params?.area === "kiosk" ? "kiosk" : "grill"}
    />
  );
}
