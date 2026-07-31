import { apiBaseUrl, csrfHeaders } from "@/lib/api";

export type Family = {
  id: string;
  organization_id: string;
  display_name: string;
  status: "ACTIVE";
  internal_note: string | null;
  created_at: string;
  updated_at: string;
};

export type FamilyListItem = Family & {
  children_count: number;
  helpers_count: number;
};

export type FamilyInput = {
  display_name: string;
  internal_note: string | null;
};

export type FamilyMemberType = "CHILD" | "HELPER";
export type FamilyMember = {
  id: string;
  family_id: string;
  member_type: FamilyMemberType;
  first_name: string;
  last_name: string;
  volunteer_id: string | null;
};
export type FamilyMemberInput = Omit<FamilyMember, "id" | "family_id" | "volunteer_id">;
export type FamilyVolunteer = {
  id: string;
  first_name: string;
  last_name: string;
};

export type FamilyChild = {
  id: string;
  family_id: string;
  family_display_name: string;
  first_name: string;
  last_name: string;
};

async function request<T>(path: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error(errorMessage ?? "Die Familien konnten nicht geladen werden.");
  return (await response.json()) as T;
}

export const loadFamilies = (org: string) =>
  request<FamilyListItem[]>(`/api/admin/${encodeURIComponent(org)}/families`);

export const createFamily = (org: string, payload: FamilyInput) =>
  request<Family>(
    `/api/admin/${encodeURIComponent(org)}/families`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
    "Die Familie konnte nicht erstellt werden.",
  );

const memberPath = (org: string, familyId: string) =>
  `/api/admin/${encodeURIComponent(org)}/families/${encodeURIComponent(familyId)}/members`;

export const loadFamilyMembers = (org: string, familyId: string) =>
  request<FamilyMember[]>(
    memberPath(org, familyId),
    undefined,
    "Die Familienmitglieder konnten nicht geladen werden.",
  );

export const createFamilyMember = (org: string, familyId: string, payload: FamilyMemberInput) =>
  request<FamilyMember>(
    memberPath(org, familyId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
    "Das Familienmitglied konnte nicht erstellt werden.",
  );

export const loadFamilyVolunteers = (org: string) =>
  request<FamilyVolunteer[]>(
    `/api/admin/${encodeURIComponent(org)}/families/volunteers`,
    undefined,
    "Die Volunteers konnten nicht geladen werden.",
  );

export const loadFamilyChildren = (org: string) =>
  request<FamilyChild[]>(
    `/api/admin/${encodeURIComponent(org)}/families/children`,
    undefined,
    "Die Kinder konnten nicht geladen werden.",
  );

export const updateFamilyMemberVolunteer = (
  org: string,
  familyId: string,
  memberId: string,
  volunteerId: string | null,
) =>
  request<FamilyMember>(
    `${memberPath(org, familyId)}/${encodeURIComponent(memberId)}/volunteer`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ volunteer_id: volunteerId }),
    },
    "Die Volunteer-Verknüpfung konnte nicht gespeichert werden.",
  );
