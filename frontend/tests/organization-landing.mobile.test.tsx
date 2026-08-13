import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationLanding } from "@/app/organization-landing";
import { OrganizationProvider } from "@/components/organization-provider";
import { platformFallbackOrganization } from "@/lib/organization";
import { createAuthenticatedSignup, fetchPublicPlan } from "@/lib/public-plan";
import { fetchVolunteerProfile } from "@/lib/volunteer-profile";

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
vi.mock("@/app/register/register-form", () => ({
  RegisterForm: () => <div>Registrierungsformular</div>,
}));
vi.mock("@/lib/public-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-plan")>();
  return { ...actual, fetchPublicPlan: vi.fn(), createAuthenticatedSignup: vi.fn() };
});
vi.mock("@/lib/volunteer-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/volunteer-profile")>();
  return { ...actual, fetchVolunteerProfile: vi.fn() };
});

const mockedPlan = vi.mocked(fetchPublicPlan);
const mockedProfile = vi.mocked(fetchVolunteerProfile);
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
      id: "e1",
      title: "Junioren",
      date: "2026-09-05",
      location: "Platz A",
      event_type: "Meisterschaft",
      public_description: "Erstes Spiel",
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
      public_description: null,
      shifts: [
        {
          id: "s2",
          starts_at: "2026-09-05T11:00:00+02:00",
          ends_at: "2026-09-05T13:00:00+02:00",
          required_volunteers: 2,
          occupied_volunteers: 2,
          public_note: null,
          status: "OPEN" as const,
          volunteer_names: [],
        },
      ],
    },
    {
      id: "e3",
      title: "Senioren",
      date: "2026-09-06",
      location: "Platz C",
      event_type: "Freundschaftsspiel",
      public_description: null,
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
      event_location: "Platz A",
      shift_starts_at: "2026-09-05T08:00:00+02:00",
      shift_ends_at: "2026-09-05T10:00:00+02:00",
      signup_status: "ACTIVE",
      outcome: "PENDING",
    },
  ],
};

function renderPage() {
  return render(
    <OrganizationProvider organization={organization}>
      <OrganizationLanding />
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
    localStorage.clear();
  });
  afterEach(cleanup);

  it("switches between accessible views, marks the active view and persists it", async () => {
    renderPage();
    const details = await screen.findByRole("button", { name: "Details" });
    expect(screen.getByRole("button", { name: "Karten" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("grillcrew:public-plan-view:example")).toBe("details");
    const dayButton = screen.getByRole("button", { name: /Samstag, 05. September 2026/ });
    expect(dayButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(dayButton);
    expect(dayButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Junioren")).toBeInTheDocument();
  });

  it("shows all games and their times in a single-open-day accordion", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Details" });
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const firstDay = screen.getByRole("button", { name: /Samstag, 05. September 2026/ });
    const secondDay = screen.getByRole("button", { name: /Sonntag, 06. September 2026/ });
    fireEvent.click(firstDay);
    expect(screen.getByText("Junioren")).toBeInTheDocument();
    expect(screen.getByText("Aktive")).toBeInTheDocument();
    expect(screen.getByText("Meisterschaft · 08:00–10:00 Uhr")).toBeInTheDocument();
    expect(screen.getByText("Cup · 11:00–13:00 Uhr")).toBeInTheDocument();
    expect(screen.queryByText("Platz A")).not.toBeInTheDocument();
    fireEvent.click(secondDay);
    expect(firstDay).toHaveAttribute("aria-expanded", "false");
    expect(secondDay).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Junioren")).not.toBeInTheDocument();
  });

  it("shows calendar tiles on cards and no event or location rows in the compact list", async () => {
    renderPage();
    expect(await screen.findAllByLabelText(/Kalender:/)).toHaveLength(3);
    expect(screen.getAllByText("Samstag, 05. September 2026")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Kompakte Liste" }));
    expect(screen.getAllByLabelText(/Kalender:/)).toHaveLength(2);
    expect(screen.queryByText("Junioren")).not.toBeInTheDocument();
    expect(screen.queryByText("Platz A")).not.toBeInTheDocument();
    expect(screen.queryByText("Meisterschaft")).not.toBeInTheDocument();
  });

  it("shows compact capacity, status and 44px signup actions", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Kompakte Liste" }));
    expect(screen.getByText("1 von 3 Plätzen besetzt")).toBeInTheDocument();
    expect(screen.getAllByText("Vollständig belegt")).toHaveLength(2);
    const action = screen.getByRole("button", { name: /Einsatz anmelden: Junioren/ });
    expect(action).toHaveClass("min-h-11", "w-full");
    fireEvent.click(action);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Helfer-Login");
  });

  it("shows own upcoming signups only when authenticated and prevents duplicate signup", async () => {
    authState.isAuthenticated = true;
    renderPage();
    const section = await screen.findByRole("region", { name: "Meine kommenden Einsätze" });
    expect(within(section).getByText("Status: Angemeldet")).toBeInTheDocument();
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    const ownAction = await screen.findByRole("button", { name: /Bereits angemeldet: Junioren/ });
    expect(ownAction).toBeDisabled();
    fireEvent.click(within(section).getByRole("button", { name: /Junioren/ }));
    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Samstag, 05. September 2026/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await waitFor(() => expect(document.getElementById("shift-s1")).toHaveClass("ring-2"));
  });

  it("shows an honest authenticated empty state", async () => {
    authState.isAuthenticated = true;
    mockedProfile.mockResolvedValue({ ...profile, upcoming_signups: [] });
    renderPage();
    expect(await screen.findByText("Du hast noch keine kommenden Einsätze.")).toBeInTheDocument();
  });

  it("does not render the private section when signed out", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Karten" });
    expect(
      screen.queryByRole("region", { name: "Meine kommenden Einsätze" }),
    ).not.toBeInTheDocument();
    expect(mockedProfile).not.toHaveBeenCalled();
  });
});
