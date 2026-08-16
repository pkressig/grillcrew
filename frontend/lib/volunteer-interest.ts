import { apiBaseUrl } from "@/lib/api";

export type VolunteerInterestArea = "GRILL" | "KIOSK" | "EITHER";

export type VolunteerInterestInput = {
  first_name: string;
  last_name: string;
  contact: string;
  message?: string;
  area?: VolunteerInterestArea;
  /** Honeypot field. Must stay empty; a filled value marks the submission as
   * spam. Reuses the same field name/convention as the anonymous shift
   * signup contract (see `PublicSignupInput.website` in `lib/public-plan.ts`). */
  website: string;
  /** ISO timestamp captured when the form was first shown; the backend
   * rejects submissions filled in under 2 seconds as bot traffic (same
   * min-fill-time check as `PublicSignupInput.form_started_at`). */
  form_started_at: string;
};

export class VolunteerInterestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "VolunteerInterestError";
  }
}

/** Submits the "not sure yet? apply anyway" interest form on the club
 * recruitment landing page. Anonymous public endpoint, so — like the
 * anonymous shift signup it mirrors — no credentials/CSRF header is sent. */
export async function submitVolunteerInterest(
  org: string,
  input: VolunteerInterestInput,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/api/public/${encodeURIComponent(org)}/volunteer-interest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw new VolunteerInterestError("volunteer interest submission failed", response.status);
  }
}
