import { apiBaseUrl } from "@/lib/api";

export type PublicShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
  occupied_volunteers: number;
  public_note: string | null;
  status: "OPEN" | "CLOSED";
  volunteer_names: string[];
};

export type PublicPlanEvent = {
  id: string;
  title: string;
  date: string;
  location: string;
  event_type: string;
  public_description: string | null;
  shifts: PublicShift[];
};

export type PublicPlan = { events: PublicPlanEvent[] };

export async function fetchPublicPlan(org: string, signal?: AbortSignal): Promise<PublicPlan> {
  const response = await fetch(`${apiBaseUrl}/api/public/${encodeURIComponent(org)}/plan`, {
    signal,
  });
  if (!response.ok) throw new Error("Der Einsatzplan konnte nicht geladen werden.");
  return (await response.json()) as PublicPlan;
}

export type PublicSignupInput = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  public_display_consent: boolean;
  website: string;
  form_started_at: string;
};

export type PublicSignupResult = {
  message: string;
  signup: {
    public_name: string;
    occupied_volunteers: number;
    required_volunteers: number;
  } | null;
  management_url: string | null;
};

export type ManagedSignup = {
  organization_name: string;
  organization_slug: string;
  event_title: string;
  event_type: string;
  event_date: string;
  event_location: string;
  event_public_description: string | null;
  shift_starts_at: string;
  shift_ends_at: string;
  shift_status: "OPEN" | "CLOSED" | "CANCELLED";
  public_name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  signup_status: "ACTIVE" | "CANCELLED_BY_VOLUNTEER" | "CANCELLED_BY_ADMIN";
  cancellation_deadline: string;
  can_cancel: boolean;
  cancellation_guidance: string | null;
  cancelled_at: string | null;
};

export class PublicSignupError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "PublicSignupError";
  }
}

export async function createPublicSignup(
  org: string,
  shiftId: string,
  input: PublicSignupInput,
): Promise<PublicSignupResult> {
  const response = await fetch(
    `${apiBaseUrl}/api/public/${encodeURIComponent(org)}/shifts/${encodeURIComponent(shiftId)}/signups`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw new PublicSignupError("signup failed", response.status);
  }
  return (await response.json()) as PublicSignupResult;
}

export async function fetchManagedSignup(org: string, token: string): Promise<ManagedSignup> {
  const response = await fetch(
    `${apiBaseUrl}/api/public/${encodeURIComponent(org)}/signups/manage/${encodeURIComponent(token)}`,
  );
  if (!response.ok) throw new PublicSignupError("invalid management link", response.status);
  return (await response.json()) as ManagedSignup;
}

export async function cancelManagedSignup(org: string, token: string): Promise<ManagedSignup> {
  const response = await fetch(
    `${apiBaseUrl}/api/public/${encodeURIComponent(org)}/signups/manage/${encodeURIComponent(token)}/cancel`,
    { method: "POST" },
  );
  if (!response.ok) throw new PublicSignupError("cancellation failed", response.status);
  return (await response.json()) as ManagedSignup;
}
