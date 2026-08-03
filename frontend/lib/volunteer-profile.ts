import { apiBaseUrl, csrfHeaders, ensureCsrfToken } from "@/lib/api";

export type VolunteerProfile = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  compensation_preference: "WORK_HOURS" | "VOLUNTARY" | "PAYOUT";
  compensation_family_member_id: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBaseUrl + path, { credentials: "include", ...init });
  if (!response.ok) {
    let detail = "Die Anfrage konnte nicht verarbeitet werden.";
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string" && payload.detail.trim()) detail = payload.detail;
    } catch {
      // Keep the safe fallback for non-JSON responses.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export async function fetchVolunteerProfile(): Promise<VolunteerProfile> {
  return request<VolunteerProfile>("/api/volunteer/profile");
}

export async function updateVolunteerProfile(payload: Partial<VolunteerProfile>) {
  await ensureCsrfToken();
  return request<VolunteerProfile>("/api/volunteer/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
}

export async function registerVolunteer(payload: {
  organization_slug: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  password: string;
  compensation_preference?: string;
  child_first_name?: string;
  child_last_name?: string;
}) {
  return request<{ ok: boolean }>("/api/auth/volunteer/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
