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
