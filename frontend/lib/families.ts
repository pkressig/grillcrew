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
  team_name: string | null;
};
export type FamilyMemberInput = {
  member_type: FamilyMemberType;
  first_name: string;
  last_name: string;
  team_name?: string | null;
};
export type VolunteerCompensation = "WORK_HOURS" | "VOLUNTARY" | "PAYOUT";
export type VolunteerStatus = "ACTIVE" | "INACTIVE";
export type FamilyVolunteer = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  compensation_preference: VolunteerCompensation;
  compensation_family_member_id: string | null;
  internal_note: string | null;
  status: VolunteerStatus;
  is_grill_helper: boolean;
  is_kiosk_helper: boolean;
};
export type FamilyVolunteerUpdate = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  compensation_preference: VolunteerCompensation;
  compensation_family_member_id: string | null;
  internal_note: string | null;
  status: VolunteerStatus;
  is_grill_helper: boolean;
  is_kiosk_helper: boolean;
};

/** Direct admin creation, without first creating a family member. */
export type VolunteerCreateInput = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  compensation_preference: VolunteerCompensation;
  compensation_family_member_id?: string | null;
  internal_note?: string | null;
  status?: VolunteerStatus;
  is_grill_helper?: boolean;
  is_kiosk_helper?: boolean;
};

/** Broader admin browse row: every org volunteer, plus account/family badges. */
export type VolunteerDirectoryEntry = FamilyVolunteer & {
  has_account: boolean;
  family_display_name: string | null;
};

export type FamilyChild = {
  id: string;
  family_id: string;
  family_display_name: string;
  first_name: string;
  last_name: string;
  team_name: string | null;
};

/** One member row within a volunteer's reverse family lookup. */
export type VolunteerFamilyMember = {
  id: string;
  member_type: FamilyMemberType;
  first_name: string;
  last_name: string;
  team_name: string | null;
  volunteer_id: string | null;
  volunteer_first_name: string | null;
  volunteer_last_name: string | null;
};

export type VolunteerFamily = {
  family_id: string;
  family_display_name: string;
  family_internal_note: string | null;
  members: VolunteerFamilyMember[];
};

async function request<T>(path: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error(errorMessage ?? "Die Familien konnten nicht geladen werden.");
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const familiesPath = (org: string) => `/api/admin/${encodeURIComponent(org)}/families`;

export const loadFamilies = (org: string) => request<FamilyListItem[]>(familiesPath(org));

export const createFamily = (org: string, payload: FamilyInput) =>
  request<Family>(
    familiesPath(org),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
    "Die Familie konnte nicht erstellt werden.",
  );

export type FamilyUpdateInput = { display_name: string };

export const updateFamily = (org: string, familyId: string, payload: FamilyUpdateInput) =>
  request<Family>(
    `${familiesPath(org)}/${encodeURIComponent(familyId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
    "Der Familienname konnte nicht gespeichert werden.",
  );

const memberPath = (org: string, familyId: string) =>
  `${familiesPath(org)}/${encodeURIComponent(familyId)}/members`;

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
    `${familiesPath(org)}/volunteers`,
    undefined,
    "Die Volunteers konnten nicht geladen werden.",
  );

export const loadAllVolunteers = (org: string) =>
  request<VolunteerDirectoryEntry[]>(
    `${familiesPath(org)}/all-volunteers`,
    undefined,
    "Die Helfer konnten nicht geladen werden.",
  );

export const createVolunteer = (org: string, payload: VolunteerCreateInput) =>
  request<FamilyVolunteer>(
    `${familiesPath(org)}/volunteers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
    "Der Helfer konnte nicht erstellt werden.",
  );

export const loadFamilyChildren = (org: string) =>
  request<FamilyChild[]>(
    `${familiesPath(org)}/children`,
    undefined,
    "Die Kinder konnten nicht geladen werden.",
  );

export const updateFamilyVolunteer = (
  org: string,
  volunteerId: string,
  payload: FamilyVolunteerUpdate,
) =>
  request<FamilyVolunteer>(
    `${familiesPath(org)}/volunteers/${encodeURIComponent(volunteerId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
    "Die Helferdaten konnten nicht gespeichert werden.",
  );

export const loadVolunteerFamily = (org: string, volunteerId: string) =>
  request<VolunteerFamily | null>(
    `${familiesPath(org)}/volunteers/${encodeURIComponent(volunteerId)}/family`,
    undefined,
    "Die Familie des Helfers konnte nicht geladen werden.",
  );

export const sendVolunteerPasswordReset = (org: string, volunteerId: string) =>
  request<{ ok: boolean }>(
    `${familiesPath(org)}/volunteers/${encodeURIComponent(volunteerId)}/send-password-reset`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
    },
    "Der Reset-Link konnte nicht gesendet werden.",
  );

export const setVolunteerPassword = (org: string, volunteerId: string, newPassword: string) =>
  request<{ ok: boolean }>(
    `${familiesPath(org)}/volunteers/${encodeURIComponent(volunteerId)}/set-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ new_password: newPassword }),
    },
    "Das Passwort konnte nicht gesetzt werden.",
  );

export async function deleteVolunteer(org: string, volunteerId: string): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}${familiesPath(org)}/volunteers/${encodeURIComponent(volunteerId)}`,
    { method: "DELETE", credentials: "include", headers: { ...csrfHeaders() } },
  );
  if (response.ok) return;
  let detail: string | undefined;
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    // Use the stable German fallback for non-JSON intermediary responses.
  }
  throw new Error(detail ?? "Der Helfer konnte nicht gelöscht werden.");
}

export async function deleteFamilyMember(
  org: string,
  familyId: string,
  memberId: string,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}${memberPath(org, familyId)}/${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { ...csrfHeaders() },
    },
  );
  if (response.ok) return;
  let detail: string | undefined;
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    // Use the stable German fallback for non-JSON intermediary responses.
  }
  throw new Error(detail ?? "Das Familienmitglied konnte nicht entfernt werden.");
}

export async function deleteFamily(org: string, familyId: string): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}${familiesPath(org)}/${encodeURIComponent(familyId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { ...csrfHeaders() },
    },
  );
  if (response.ok) return;
  let detail: string | undefined;
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    // Use the stable German fallback for non-JSON intermediary responses.
  }
  throw new Error(detail ?? "Die Familie konnte nicht gelöscht werden.");
}

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
