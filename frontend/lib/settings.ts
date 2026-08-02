import { apiBaseUrl, csrfHeaders } from "@/lib/api";

export type OrganizationSettings = {
  id: string;
  organization_id: string;
  payout_rate_minor_per_hour: number;
  signup_rate_limit_per_contact: number;
  signup_rate_limit_window_minutes: number;
  kiosk_lead_minutes: number;
  kiosk_trail_minutes: number;
  default_game_duration_minutes: number;
  coordination_contact_label: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationSettingsInput = Partial<
  Omit<OrganizationSettings, "id" | "organization_id" | "created_at" | "updated_at">
>;

export type HomeVenue = {
  id: string;
  organization_id: string;
  name: string;
  name_normalized: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HomeVenueInput = { name: string };
export type HomeVenueUpdateInput = Partial<{ name: string; is_active: boolean }>;

export type MenuType = "FRIES_NUGGETS" | "FRIES_NUGGETS_BURGER";

export type CrewSizeRule = {
  id: string;
  organization_id: string;
  sort_order: number;
  pattern: string | null;
  menu_type: MenuType;
  required_griller_count: number;
  min_games_per_shift: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrewSizeRuleInput = {
  pattern: string | null;
  menu_type: MenuType;
  required_griller_count: number;
  min_games_per_shift: number;
};

export type CrewSizeRuleUpdateInput = Partial<
  Omit<CrewSizeRule, "id" | "organization_id" | "sort_order" | "created_at" | "updated_at">
>;

async function request<T>(path: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  if (!response.ok)
    throw new Error(errorMessage ?? "Die Einstellungen konnten nicht geladen werden.");
  return (await response.json()) as T;
}

function writeInit(method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  };
}

const base = (org: string) => `/api/admin/${encodeURIComponent(org)}/settings`;

export const loadOrganizationSettings = (org: string) =>
  request<OrganizationSettings>(
    `${base(org)}/organization-settings`,
    undefined,
    "Die Organisationseinstellungen konnten nicht geladen werden.",
  );

export const updateOrganizationSettings = (org: string, payload: OrganizationSettingsInput) =>
  request<OrganizationSettings>(
    `${base(org)}/organization-settings`,
    writeInit("PATCH", payload),
    "Die Organisationseinstellungen konnten nicht gespeichert werden.",
  );

export const loadHomeVenues = (org: string) =>
  request<HomeVenue[]>(
    `${base(org)}/home-venues`,
    undefined,
    "Die Heimplätze konnten nicht geladen werden.",
  );

export const createHomeVenue = (org: string, payload: HomeVenueInput) =>
  request<HomeVenue>(
    `${base(org)}/home-venues`,
    writeInit("POST", payload),
    "Der Heimplatz konnte nicht erstellt werden.",
  );

export const updateHomeVenue = (org: string, venueId: string, payload: HomeVenueUpdateInput) =>
  request<HomeVenue>(
    `${base(org)}/home-venues/${encodeURIComponent(venueId)}`,
    writeInit("PATCH", payload),
    "Der Heimplatz konnte nicht gespeichert werden.",
  );

export const loadCrewSizeRules = (org: string) =>
  request<CrewSizeRule[]>(
    `${base(org)}/crew-size-rules`,
    undefined,
    "Die Crew-Regeln konnten nicht geladen werden.",
  );

export const createCrewSizeRule = (org: string, payload: CrewSizeRuleInput) =>
  request<CrewSizeRule>(
    `${base(org)}/crew-size-rules`,
    writeInit("POST", payload),
    "Die Crew-Regel konnte nicht erstellt werden.",
  );

export const updateCrewSizeRule = (org: string, ruleId: string, payload: CrewSizeRuleUpdateInput) =>
  request<CrewSizeRule>(
    `${base(org)}/crew-size-rules/${encodeURIComponent(ruleId)}`,
    writeInit("PATCH", payload),
    "Die Crew-Regel konnte nicht gespeichert werden.",
  );

export const reorderCrewSizeRules = (org: string, orderedIds: string[]) =>
  request<CrewSizeRule[]>(
    `${base(org)}/crew-size-rules/reorder`,
    writeInit("POST", { ordered_ids: orderedIds }),
    "Die Reihenfolge konnte nicht gespeichert werden.",
  );
