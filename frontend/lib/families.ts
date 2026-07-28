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

export type FamilyInput = {
  display_name: string;
  internal_note: string | null;
};

async function request<T>(path: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error(errorMessage ?? "Die Familien konnten nicht geladen werden.");
  return (await response.json()) as T;
}

export const loadFamilies = (org: string) =>
  request<Family[]>(`/api/admin/${encodeURIComponent(org)}/families`);

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
