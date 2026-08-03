import { fetchPublicOrganization } from "@/lib/organization";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ org?: string }>;
}) {
  const params = await searchParams;
  return <RegisterForm organization={await fetchPublicOrganization(params?.org)} />;
}
