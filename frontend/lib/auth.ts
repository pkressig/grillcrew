import {
  apiBaseUrl,
  clearCsrfToken,
  csrfHeaders,
  ensureCsrfToken,
  fetchCsrfToken,
} from "@/lib/api";

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
    // The short-lived access token has expired. Silently trade the long-lived
    // refresh token (still valid for up to 30 days, sliding on each use) for a
    // new session instead of treating this as a real logout — the user never
    // asked to be signed out, the access token just aged out in the background.
    return refreshAuthSession();
  }
  if (!response.ok) throw new Error("Die Sitzung konnte nicht geladen werden.");
  const session = (await response.json()) as AuthSession;
  await fetchCsrfToken();
  return session;
}

async function refreshAuthSession(): Promise<AuthSession | null> {
  try {
    await ensureCsrfToken();
    const response = await fetch(apiBaseUrl + "/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { ...csrfHeaders() },
    });
    if (!response.ok) {
      clearCsrfToken();
      return null;
    }
    const session = (await response.json()) as AuthSession;
    await fetchCsrfToken();
    return session;
  } catch {
    clearCsrfToken();
    return null;
  }
}
