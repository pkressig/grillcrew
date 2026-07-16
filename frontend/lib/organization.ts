export type PublicOrganization = {
  name: string;
  short_name: string | null;
  slug: string;
  theme: {
    name: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
  };
  language: string;
  locale: string;
  timezone: string;
  currency: string;
  contact: {
    email: string | null;
    phone: string | null;
    url: string | null;
  };
  settings: {
    payout_rate_minor_per_hour: number;
    signup_rate_limit_per_contact: number;
    signup_rate_limit_window_minutes: number;
    coordination_contact_label: string | null;
  };
};

export const platformFallbackOrganization: PublicOrganization = {
  name: "Volunteer Platform",
  short_name: "Platform",
  slug: "platform",
  theme: {
    name: "Platform fallback",
    logo_url: null,
    primary_color: "#262626",
    secondary_color: "#525252",
  },
  language: "de",
  locale: "de-CH",
  timezone: "Europe/Zurich",
  currency: "CHF",
  contact: {
    email: null,
    phone: null,
    url: null,
  },
  settings: {
    payout_rate_minor_per_hour: 900,
    signup_rate_limit_per_contact: 5,
    signup_rate_limit_window_minutes: 60,
    coordination_contact_label: null,
  },
};

export async function fetchPublicOrganization(
  organizationHint?: string,
): Promise<PublicOrganization> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const organizationPath = organizationHint
    ? `/api/public/organization/${encodeURIComponent(organizationHint)}`
    : "/api/public/organization";

  try {
    const response = await fetch(`${apiUrl}${organizationPath}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return platformFallbackOrganization;
    }

    return (await response.json()) as PublicOrganization;
  } catch {
    return platformFallbackOrganization;
  }
}
