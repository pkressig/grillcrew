import { apiBaseUrl, clearCsrfToken, fetchCsrfToken } from "@/lib/api";

export type StaffRole = "ADMIN" | "KOORDINATION" | "KIOSK" | "VORSTAND_LESEN";
export type AuthUser = {
  id: string;
  email_normalized: string;
  display_name: string | null;
  status: "INVITED" | "ACTIVE" | "DISABLED";
};
export type AuthMembership = {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  role: StaffRole;
};
export type AuthSession = { user: AuthUser; memberships: AuthMembership[] };

export async function fetchAuthSession(): Promise<AuthSession | null> {
  const response = await fetch(apiBaseUrl + "/api/auth/me", { credentials: "include" });
  if (response.status === 401) {
    clearCsrfToken();
    return null;
  }
  if (!response.ok) throw new Error("Die Sitzung konnte nicht geladen werden.");
  const session = (await response.json()) as AuthSession;
  await fetchCsrfToken();
  return session;
}
