import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationLanding } from "@/app/organization-landing";
import { OrganizationProvider } from "@/components/organization-provider";
import { platformFallbackOrganization } from "@/lib/organization";
import { createAuthenticatedSignup, fetchPublicPlan } from "@/lib/public-plan";
import { fetchVolunteerProfile, requestPasswordReset } from "@/lib/volunteer-profile";

const authState = {
  isAuthenticated: false,
  isLoading: false,
  refresh: vi.fn(async () => undefined),
};
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    ...authState,
    user: authState.isAuthenticated ? { id: "u1" } : null,
    memberships: [],
    error: null,
    clear: vi.fn(),
  }),
}));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => <button>Logout</button> }));
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));
vi.mock("@/lib/public-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-plan")>();
  return { ...actual, fetchPublicPlan: vi.fn(), createAuthenticatedSignup: vi.fn() };
});
vi.mock("@/lib/volunteer-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/volunteer-profile")>();
  return { ...actual, fetchVolunteerProfile: vi.fn(), requestPasswordReset: vi.fn() };
});

const mockedPlan = vi.mocked(fetchPublicPlan);
const mockedProfile = vi.mocked(fetchVolunteerProfile);
const mockedRequestPasswordReset = vi.mocked(requestPasswordReset);
const mockedSignup = vi.mocked(createAuthenticatedSignup);
const organization = {
  ...platformFallbackOrganization,
  name: "FC Beispiel",
  slug: "example",
  timezone: "Europe/Zurich",
};
const plan = {
  events: [
    {
      id: "e0",
      title: "Frauen",
      date: "2026-09-05",
      location: "Platz C",
      event_type: "Cup",
      public_description: "FC Beispiel – FC Alpha",
      kickoff_time: "07:00:00",
      shifts: [],
    },
    {
      id: "e1",
      title: "Junioren",
      date: "2026-09-05",
      location: "Platz A",
      event_type: "Meisterschaft",
      public_description: "FC Beispiel – FC Beta",
      kickoff_time: "08:00:00",
      shifts: [
        {
          id: "s1",
          starts_at: "2026-09-05T08:00:00+02:00",
          ends_at: "2026-09-05T10:00:00+02:00",
          required_volunteers: 3,
          occupied_volunteers: 1,
          public_note: null,
          status: "OPEN" as const,
          volunteer_names: ["Anna"],
        },
      ],
    },
    {
      id: "e2",
      title: "Aktive",
      date: "2026-09-05",
      location: "Platz B",
      event_type: "Cup",
      public_description: "FC Beispiel – FC Gamma",
      kickoff_time: "11:00:00",
      shifts: [],
    },
    {
      id: "e3",
      title: "Senioren",
      date: "2026-09-06",
      location: "Platz C",
      event_type: "Freundschaftsspiel",
      public_description: null,
      kickoff_time: "09:00:00",
      shifts: [
        {
          id: "s3",
          starts_at: "2026-09-06T09:00:00+02:00",
          ends_at: "2026-09-06T11:00:00+02:00",
          required_volunteers: 2,
          occupied_volunteers: 0,
          public_note: null,
          status: "OPEN" as const,
          volunteer_names: [],
        },
      ],
    },
  ],
};
const profile = {
  first_name: "Mia",
  last_name: "Muster",
  phone: "+41 79 000 00 00",
  email: "private@example.test",
  organization,
  compensation_preference: "VOLUNTARY" as const,
  compensation_family_member_id: null,
  compensation_family_member_name: null,
  family_children: [],
  completed_signups: [],
  upcoming_signups: [
    {
      id: "signup-1",
      event_title: "Junioren",
      event_date: "2026-09-05",
      shift_starts_at: "2026-09-05T08:00:00+02:00",
      shift_ends_at: "2026-09-05T10:00:00+02:00",
      signup_status: "ACTIVE" as const,
      outcome: "OPEN" as const,
      compensation_type: "VOLUNTARY" as const,
      credited_family_member_id: null,
      credited_family_member_name: null,
      can_cancel: true,
    },
  ],
};

function renderPage(shiftType: "GRILL" | "KIOSK" = "GRILL") {
  return render(
    <OrganizationProvider organization={organization}>
      <OrganizationLanding shiftType={shiftType} />
    </OrganizationProvider>,
  );
}

describe("mobile public plan", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.refresh.mockClear();
    mockedPlan.mockReset().mockResolvedValue(plan);
    mockedProfile.mockReset().mockResolvedValue(profile);
    mockedSignup.mockReset();
    mockedRequestPasswordReset.mockReset();
    replaceMock.mockReset();
    localStorage.clear();
    window.history.replaceState({}, "", "/example/grill");
  });
  afterEach(cleanup);

  it("expands a day to reveal its games and marks it as expanded", async () => {
    renderPage();
    const dayButton = await screen.findByRole("button", { name: /Samstag, 05. September 2026/ });
    expect(dayButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(dayButton);
    expect(dayButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Junioren")).toBeInTheDocument();
    expect(screen.getByText("FC Beispiel – FC Beta")).toBeInTheDocument();
  });

  it("shows all games and their times in a single-open-day accordion", async () => {
    renderPage();
    const firstDay = await screen.findByRole("button", { name: /Samstag, 05. September 2026/ });
    const secondDay = screen.getByRole("button", { name: /Sonntag, 06. September 2026/ });
    fireEvent.click(firstDay);
    expect(screen.getByText("Junioren")).toBeInTheDocument();
    expect(screen.getByText("FC Beispiel – FC Beta")).toBeInTheDocument();
    expect(screen.getByText("Aktive")).toBeInTheDocument();
    expect(screen.getByText("FC Beispiel – FC Gamma")).toBeInTheDocument();
    const games = within(screen.getByRole("region", { name: "Spiele an diesem Tag" }));
    expect(games.getAllByRole("listitem")).toHaveLength(3);
    expect(games.getByText("07:00")).toBeInTheDocument();
    expect(games.getByText("08:00")).toBeInTheDocument();
    expect(games.getByText("11:00")).toBeInTheDocument();
    expect(games.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "07:00FrauenFC Beispiel – FC Alpha",
      "08:00JuniorenFC Beispiel – FC Beta",
      "11:00AktiveFC Beispiel – FC Gamma",
    ]);
    expect(screen.getAllByRole("button", { name: /Einsatz anmelden:/ })).toHaveLength(1);
    expect(screen.queryByText("Platz A")).not.toBeInTheDocument();
    fireEvent.click(secondDay);
    expect(firstDay).toHaveAttribute("aria-expanded", "false");
    expect(secondDay).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Junioren")).not.toBeInTheDocument();
  });

  it("shows shift capacity, status and 44px signup actions once its day is expanded", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Samstag, 05. September 2026/ }));
    expect(screen.getByText("1 von 3 Plätzen besetzt · Anna")).toBeInTheDocument();
    expect(screen.getByText("Offen")).toHaveClass("text-status-error");
    expect(screen.queryByText("Vollständig belegt")).not.toBeInTheDocument();
    const action = screen.getByRole("button", { name: /Einsatz anmelden: Junioren/ });
    expect(action).toHaveClass("min-h-11", "w-full");
    fireEvent.click(action);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Helfer-Login");
  });

  it("requests a password reset link and shows a generic confirmation regardless of outcome", async () => {
    mockedRequestPasswordReset.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Login" }));
    fireEvent.click(screen.getByRole("button", { name: "Passwort vergessen?" }));
    expect(screen.getByRole("heading", { name: "Passwort vergessen" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("E-Mail"), {
      target: { value: "mia@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link senden" }));
    expect(
      await screen.findByText(/wurde ein Link zum Zurücksetzen des Passworts gesendet/),
    ).toBeInTheDocument();
    expect(mockedRequestPasswordReset).toHaveBeenCalledWith("mia@example.test");
  });

  it("shows the same generic confirmation even when the reset request fails", async () => {
    mockedRequestPasswordReset.mockRejectedValue(new Error("network error"));
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Login" }));
    fireEvent.click(screen.getByRole("button", { name: "Passwort vergessen?" }));
    fireEvent.change(screen.getByLabelText("E-Mail"), {
      target: { value: "unknown@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link senden" }));
    expect(
      await screen.findByText(/wurde ein Link zum Zurücksetzen des Passworts gesendet/),
    ).toBeInTheDocument();
  });

  it("returns to the login form from the forgot-password view", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Login" }));
    fireEvent.click(screen.getByRole("button", { name: "Passwort vergessen?" }));
    fireEvent.click(screen.getByRole("button", { name: "Zurück zur Anmeldung" }));
    expect(screen.getByRole("heading", { name: "Helfer-Login" })).toBeInTheDocument();
  });

  it("carries the pending shift when switching from login to registration", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Samstag, 05. September 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: /Einsatz anmelden: Junioren/ }));
    fireEvent.click(screen.getByRole("button", { name: "Noch kein Konto? Jetzt registrieren" }));
    expect(replaceMock).toHaveBeenCalledWith("/register?org=example&area=grill&shift=s1");
  });

  it("restores a pending shift signup after returning from registration, expanding its day and opening the form", async () => {
    window.history.pushState({}, "", "/example/grill?shift=s1");
    authState.isAuthenticated = true;
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Samstag, 05. September 2026/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    const form = screen.getByRole("form", { name: /Eintragung für Junioren/ });
    expect(within(form).getByText("+41 79 000 00 00 · private@example.test")).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/example/grill");
  });

  it("opens the login modal when returning from registration with ?login=1", async () => {
    window.history.pushState({}, "", "/example/grill?login=1");
    renderPage();
    expect(await screen.findByRole("heading", { name: "Helfer-Login" })).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/example/grill");
  });

  it("shows own upcoming signups only when authenticated, linking each to its detail page, and prevents duplicate signup", async () => {
    authState.isAuthenticated = true;
    renderPage();
    const section = await screen.findByRole("region", { name: "Meine kommenden Einsätze" });
    expect(within(section).getByText("Status: Angemeldet")).toBeInTheDocument();
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    expect(within(section).getByRole("link", { name: /^Samstag/ })).toHaveAttribute(
      "href",
      "/profile/signups/signup-1",
    );
    fireEvent.click(await screen.findByRole("button", { name: /Samstag, 05. September 2026/ }));
    const ownAction = await screen.findByRole("button", { name: /Bereits angemeldet: Junioren/ });
    expect(ownAction).toBeDisabled();
  });

  it("offers a compact Absagen control next to the disabled Bereits angemeldet button in the shift row", async () => {
    authState.isAuthenticated = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Samstag, 05. September 2026/ }));
    const shiftRow = document.getElementById("shift-s1")!;
    expect(
      within(shiftRow).getByRole("button", { name: /Bereits angemeldet: Junioren/ }),
    ).toBeDisabled();
    fireEvent.click(within(shiftRow).getByRole("button", { name: 'Einsatz "Junioren" absagen' }));
    expect(await screen.findByRole("dialog", { name: "Einsatz abmelden" })).toBeInTheDocument();
  });

  it("offers an Absagen control next to the status that opens the cancel-reason modal", async () => {
    authState.isAuthenticated = true;
    renderPage();
    const section = await screen.findByRole("region", { name: "Meine kommenden Einsätze" });
    fireEvent.click(within(section).getByRole("button", { name: 'Einsatz "Junioren" absagen' }));
    expect(await screen.findByRole("dialog", { name: "Einsatz abmelden" })).toBeInTheDocument();
  });

  it("shows an honest authenticated empty state", async () => {
    authState.isAuthenticated = true;
    mockedProfile.mockResolvedValue({ ...profile, upcoming_signups: [] });
    renderPage();
    expect(await screen.findByText("Du hast noch keine kommenden Einsätze.")).toBeInTheDocument();
  });

  it("shows an open/filled summary badge on each collapsed day in the details view", async () => {
    // Scoped to this test only: a second plan where the Sunday shift is
    // already fully staffed, so both the "still needs helpers" and the
    // "fully covered" badge states are exercised without mutating the
    // shared fixture other tests in this file rely on.
    mockedPlan.mockReset().mockResolvedValue({
      events: plan.events.map((eventItem) =>
        eventItem.id === "e3"
          ? {
              ...eventItem,
              shifts: eventItem.shifts.map((shift) => ({
                ...shift,
                occupied_volunteers: shift.required_volunteers,
                volunteer_names: ["Chris", "Deniz"],
              })),
            }
          : eventItem,
      ),
    });
    renderPage();
    expect(
      await screen.findByRole("button", {
        name: /Samstag, 05\. September 2026.*1 Schicht offen.*2 Plätze/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sonntag, 06\. September 2026.*Alle Schichten belegt/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Samstag, 05\. September 2026.*Alle Schicht/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Sonntag, 06\. September 2026.*offen/ }),
    ).not.toBeInTheDocument();
  });

  it("does not render the private section when signed out", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Samstag, 05. September 2026/ });
    expect(
      screen.queryByRole("region", { name: "Meine kommenden Einsätze" }),
    ).not.toBeInTheDocument();
    expect(mockedProfile).not.toHaveBeenCalled();
  });
});

describe("compact day-row layout on narrow screens", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    mockedPlan.mockReset().mockResolvedValue(plan);
    localStorage.clear();
    window.history.replaceState({}, "", "/example/grill");
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("abbreviates the weekday and shows only free places instead of wrapping to a second line", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Sa\. 05\.09\.2026.*2 Plätze offen/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /So\. 06\.09\.2026.*2 Plätze offen/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Schicht offen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Samstag, 05\. September 2026/)).not.toBeInTheDocument();
  });

  it("keeps the fully-booked label as is", async () => {
    mockedPlan.mockReset().mockResolvedValue({
      events: plan.events.map((eventItem) =>
        eventItem.id === "e3"
          ? {
              ...eventItem,
              shifts: eventItem.shifts.map((shift) => ({
                ...shift,
                occupied_volunteers: shift.required_volunteers,
                volunteer_names: ["Chris", "Deniz"],
              })),
            }
          : eventItem,
      ),
    });
    renderPage();
    expect(
      await screen.findByRole("button", { name: /So\. 06\.09\.2026.*Alle Schichten belegt/ }),
    ).toBeInTheDocument();
  });
});
