import { apiBaseUrl, csrfHeaders, ensureCsrfToken } from "@/lib/api";
import type { PublicOrganization } from "@/lib/organization";

export type CompensationType = "WORK_HOURS" | "VOLUNTARY" | "PAYOUT";

export type SignupStatus = "ACTIVE" | "CANCELLED_BY_VOLUNTEER" | "CANCELLED_BY_ADMIN";

export type SignupOutcome =
  "OPEN" | "ATTENDED" | "EXCUSED_CANCELLED" | "LATE_CANCELLED" | "NO_SHOW" | "SUBSTITUTE_ORGANIZED";

export type VolunteerProfile = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  organization: PublicOrganization;
  compensation_preference: CompensationType;
  compensation_family_member_id: string | null;
  compensation_family_member_name: string | null;
  upcoming_signups: VolunteerSignupSummary[];
  completed_signups: VolunteerSignupSummary[];
  family_children: { id: string; name: string }[];
};

export type VolunteerSignupSummary = {
  id: string;
  event_title: string;
  event_date: string;
  shift_starts_at: string;
  shift_ends_at: string;
  signup_status: SignupStatus;
  outcome: SignupOutcome;
  compensation_type: CompensationType;
  credited_family_member_id: string | null;
  credited_family_member_name: string | null;
  can_cancel: boolean;
};

export type FamilyChild = { id: string; name: string };

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
  if (response.status === 204) return undefined as T;
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

export async function updateSignupCompensation(
  signupId: string,
  payload: { compensation_type: CompensationType | null; credited_family_member_id: string | null },
) {
  await ensureCsrfToken();
  return request<VolunteerProfile>(`/api/volunteer/signups/${signupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
}

export async function cancelSignup(signupId: string, payload: { reason: string | null }) {
  await ensureCsrfToken();
  return request<VolunteerProfile>(`/api/volunteer/signups/${signupId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
}

export async function createChild(payload: {
  first_name: string;
  last_name: string;
  team_name: string | null;
}) {
  await ensureCsrfToken();
  return request<FamilyChild>("/api/volunteer/children", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
}

export async function updateChild(
  childId: string,
  payload: { first_name: string; last_name: string; team_name: string | null },
) {
  await ensureCsrfToken();
  return request<FamilyChild>(`/api/volunteer/children/${childId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
}

export async function deleteChild(childId: string): Promise<void> {
  await ensureCsrfToken();
  await request<void>(`/api/volunteer/children/${childId}`, {
    method: "DELETE",
    headers: { ...csrfHeaders() },
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request<{ ok: boolean }>("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
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
  child_team_name?: string;
}) {
  return request<{ ok: boolean }>("/api/auth/volunteer/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
