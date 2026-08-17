import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import type { AuthSession } from "@/lib/auth";
import { clearCsrfToken } from "@/lib/api";
import { platformFallbackOrganization } from "@/lib/organization";
import type { ManagedSignup } from "@/lib/public-plan";
import type { VolunteerProfile } from "@/lib/volunteer-profile";
import { OwnSignupDetail } from "@/app/profile/signups/[id]/own-signup-detail";

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back, push }) }));

const session: AuthSession = {
  user: {
    id: "volunteer-1",
    email_normalized: "mia@example.test",
    display_name: "Mia",
    status: "ACTIVE",
  },
  memberships: [],
};

const organization = {
  ...platformFallbackOrganization,
  name: "FC Beispiel",
  slug: "fc-beispiel",
};

const profile: VolunteerProfile = {
  first_name: "Mia",
  last_name: "Muster",
  phone: "+41 79 123 45 67",
  email: "mia@example.test",
  organization,
  compensation_preference: "VOLUNTARY",
  compensation_family_member_id: null,
  compensation_family_member_name: null,
  upcoming_signups: [],
  completed_signups: [],
  family_children: [],
};

const managedSignup: ManagedSignup = {
  organization_name: "FC Beispiel",
  organization_slug: "fc-beispiel",
  event_title: "Senioren 30+",
  event_type: "Meisterschaft",
  event_date: "2026-08-20",
  event_location: "Platz 1",
  event_public_description: null,
  shift_starts_at: "2026-08-20T09:00:00Z",
  shift_ends_at: "2026-08-20T13:00:00Z",
  shift_status: "OPEN",
  public_name: "Mia M.",
  first_name: "Mia",
  last_name: "Muster",
  phone: "+41 79 123 45 67",
  email: "mia@example.test",
  signup_status: "ACTIVE",
  cancellation_deadline: "2026-08-18T23:59:00Z",
  can_cancel: true,
  cancellation_guidance: null,
  cancelled_at: null,
};

function detailFetch(
  options: { signup?: ManagedSignup; signupStatus?: number } = {},
): ReturnType<typeof vi.fn> {
  let signupState = structuredClone(options.signup ?? managedSignup);
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session);
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "csrf-test" });
    if (url.endsWith("/api/volunteer/profile") && method === "GET") return Response.json(profile);
    if (url.endsWith("/api/volunteer/signups/signup-1") && method === "GET") {
      if (options.signupStatus && options.signupStatus !== 200) {
        return new Response(null, { status: options.signupStatus });
      }
      return Response.json(signupState);
    }
    if (url.endsWith("/api/volunteer/signups/signup-1/cancel") && method === "POST") {
      signupState = { ...signupState, signup_status: "CANCELLED_BY_VOLUNTEER" };
      return Response.json(profile);
    }
    return new Response(null, { status: 404 });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.cookie = "gc_csrf=; Max-Age=0";
  clearCsrfToken();
});

describe("OwnSignupDetail", () => {
  it("requires authentication before showing anything about the signup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(
      <AuthProvider>
        <OwnSignupDetail signupId="signup-1" />
      </AuthProvider>,
    );
    expect(
      await screen.findByText("Bitte melde dich an, um deine Eintragung zu sehen."),
    ).toBeInTheDocument();
  });

  it("renders the same detail shown on the emailed manage-signup page, reachable without a token", async () => {
    vi.stubGlobal("fetch", detailFetch());
    render(
      <AuthProvider>
        <OwnSignupDetail signupId="signup-1" />
      </AuthProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Meine Eintragung" })).toBeInTheDocument();
    expect(screen.getByText("Senioren 30+")).toBeInTheDocument();
    expect(screen.getByText("Platz 1")).toBeInTheDocument();
    expect(screen.getByText("Du bist verbindlich eingetragen.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: 'Einsatz "Senioren 30+" absagen' }),
    ).toBeInTheDocument();
  });

  it("shows a not-found state when the signup id does not belong to this volunteer", async () => {
    vi.stubGlobal("fetch", detailFetch({ signupStatus: 404 }));
    render(
      <AuthProvider>
        <OwnSignupDetail signupId="signup-1" />
      </AuthProvider>,
    );
    expect(
      await screen.findByText("Diese Eintragung konnte nicht gefunden werden."),
    ).toBeInTheDocument();
  });

  it("cancels via the shared cancel control and reflects the cancelled state without a page reload", async () => {
    vi.stubGlobal("fetch", detailFetch());
    render(
      <AuthProvider>
        <OwnSignupDetail signupId="signup-1" />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: 'Einsatz "Senioren 30+" absagen' }));
    const dialog = await screen.findByRole("dialog", { name: "Einsatz abmelden" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Abmelden bestätigen" }));
    await waitFor(() =>
      expect(screen.getByText("Diese Eintragung ist abgesagt.")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Für diese Eintragung ist keine weitere Aktion nötig."),
    ).toBeInTheDocument();
  });
});
