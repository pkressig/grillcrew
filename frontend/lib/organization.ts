export type PublicOrganization = {
  name: string;
  short_name: string | null;
  slug: string;
  theme: {
    name: string;
    logo_url: string | null;
    banner_url: string | null;
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
    coordination_contact_phone: string | null;
    volunteer_password_min_length: number;
  };
};

export const platformFallbackOrganization: PublicOrganization = {
  name: "Volunteer Platform",
  short_name: "Platform",
  slug: "platform",
  theme: {
    name: "Platform fallback",
    logo_url: null,
    banner_url: null,
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
    coordination_contact_phone: null,
    volunteer_password_min_length: 6,
  },
};

const LAST_ORGANIZATION_STORAGE_KEY = "grillcrew.last-organization-slug";

/** Remembers which organization this browser last visited, so a page with no
 * organization in its own URL (e.g. /profile) can still send a logged-out
 * visitor to the right club's login instead of a generic platform page. */
export function rememberLastOrganizationSlug(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_ORGANIZATION_STORAGE_KEY, slug);
  } catch {
    // Ignore storage access errors (e.g. private browsing with storage disabled).
  }
}

export function getLastOrganizationSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_ORGANIZATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

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

/** Like fetchPublicOrganization, but distinguishes a genuine "this club
 * doesn't exist" 404 (returns null) from a transient backend outage (still
 * falls back to platformFallbackOrganization, same as the lenient variant
 * above). Use this for routes that should show a clear "not found" page
 * instead of silently rendering a generic fallback organization. */
export async function fetchPublicOrganizationStrict(
  organizationSlug: string,
): Promise<PublicOrganization | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const organizationPath = `/api/public/organization/${encodeURIComponent(organizationSlug)}`;

  try {
    const response = await fetch(`${apiUrl}${organizationPath}`, {
      cache: "no-store",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return platformFallbackOrganization;
    }

    return (await response.json()) as PublicOrganization;
  } catch {
    return platformFallbackOrganization;
  }
}

export type OrganizationDirectoryEntry = {
  slug: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

export async function fetchOrganizationDirectory(): Promise<OrganizationDirectoryEntry[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const response = await fetch(`${apiUrl}/api/public/organizations`, { cache: "no-store" });
  if (!response.ok) throw new Error("Die Vereinsliste konnte nicht geladen werden.");
  return (await response.json()) as OrganizationDirectoryEntry[];
}
