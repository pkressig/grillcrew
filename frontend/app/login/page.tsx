import { fetchPublicOrganization } from "@/lib/organization";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  return <LoginForm organization={await fetchPublicOrganization()} />;
}
