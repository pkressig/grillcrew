import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import type { AuthSession } from "@/lib/auth";
import { clearCsrfToken } from "@/lib/api";
import { platformFallbackOrganization } from "@/lib/organization";
import type { VolunteerProfile, VolunteerSignupSummary } from "@/lib/volunteer-profile";
import ProfilePage from "@/app/profile/page";

const back = vi.fn();
const push = vi.fn();
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

const openSignup: VolunteerSignupSummary = {
  id: "signup-open",
  event_title: "Senioren 30+",
  event_date: "2026-08-20",
  shift_starts_at: "2026-08-20T09:00:00Z",
  shift_ends_at: "2026-08-20T13:00:00Z",
  signup_status: "ACTIVE",
  outcome: "OPEN",
  compensation_type: "VOLUNTARY",
  credited_family_member_id: null,
  credited_family_member_name: null,
  can_cancel: true,
};

const cancelledSignup: VolunteerSignupSummary = {
  ...openSignup,
  id: "signup-cancelled",
  event_title: "Junioren C",
  signup_status: "CANCELLED_BY_VOLUNTEER",
  outcome: "NO_SHOW",
  can_cancel: false,
};

const noShowSignup: VolunteerSignupSummary = {
  ...openSignup,
  id: "signup-noshow",
  event_title: "Herren 1",
  outcome: "NO_SHOW",
  can_cancel: false,
};

const deadlinePassedSignup: VolunteerSignupSummary = {
  ...openSignup,
  id: "signup-deadline-passed",
  event_title: "Damen 1",
  can_cancel: false,
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
  upcoming_signups: [openSignup, noShowSignup, deadlinePassedSignup],
  completed_signups: [cancelledSignup],
  family_children: [{ id: "child-1", name: "Leo Muster" }],
};

function profileFetch(initial: VolunteerProfile, options: { cancelStatus?: number } = {}) {
  let current: VolunteerProfile = structuredClone(initial);
  let nextChildId = 2;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session);
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "csrf-test" });
    if (url.endsWith("/api/volunteer/profile") && method === "GET") return Response.json(current);
    if (url.endsWith("/api/volunteer/profile") && method === "PATCH") {
      current = { ...current, ...JSON.parse(String(init?.body)) };
      return Response.json(current);
    }
    const cancelMatch = url.match(/\/api\/volunteer\/signups\/([^/]+)\/cancel$/);
    if (cancelMatch && method === "POST") {
      if (options.cancelStatus && options.cancelStatus !== 200) {
        return Response.json(
          { detail: "Die Frist für die Abmeldung ist abgelaufen." },
          {
            status: options.cancelStatus,
          },
        );
      }
      const id = cancelMatch[1]!;
      current = {
        ...current,
        upcoming_signups: current.upcoming_signups.map((entry) =>
          entry.id === id
            ? { ...entry, signup_status: "CANCELLED_BY_VOLUNTEER", can_cancel: false }
            : entry,
        ),
        completed_signups: current.completed_signups.map((entry) =>
          entry.id === id
            ? { ...entry, signup_status: "CANCELLED_BY_VOLUNTEER", can_cancel: false }
            : entry,
        ),
      };
      return Response.json(current);
    }
    const signupMatch = url.match(/\/api\/volunteer\/signups\/([^/]+)$/);
    if (signupMatch && method === "PATCH") {
      const id = signupMatch[1]!;
      const body = JSON.parse(String(init?.body)) as {
        compensation_type: string | null;
        credited_family_member_id: string | null;
      };
      const apply = (entry: VolunteerSignupSummary) =>
        entry.id === id
          ? {
              ...entry,
              compensation_type:
                body.compensation_type as VolunteerSignupSummary["compensation_type"],
              credited_family_member_id: body.credited_family_member_id,
            }
          : entry;
      current = {
        ...current,
        upcoming_signups: current.upcoming_signups.map(apply),
        completed_signups: current.completed_signups.map(apply),
      };
      return Response.json(current);
    }
    if (url.endsWith("/api/volunteer/children") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        first_name: string;
        last_name: string;
        team_name: string | null;
      };
      const child = { id: `child-${nextChildId++}`, name: `${body.first_name} ${body.last_name}` };
      current = { ...current, family_children: [...current.family_children, child] };
      return Response.json(child, { status: 201 });
    }
    const childMatch = url.match(/\/api\/volunteer\/children\/([^/]+)$/);
    if (childMatch && method === "PATCH") {
      const id = childMatch[1]!;
      const body = JSON.parse(String(init?.body)) as { first_name: string; last_name: string };
      const name = `${body.first_name} ${body.last_name}`;
      current = {
        ...current,
        family_children: current.family_children.map((child) =>
          child.id === id ? { ...child, name } : child,
        ),
      };
      return Response.json({ id, name });
    }
    if (childMatch && method === "DELETE") {
      const id = childMatch[1]!;
      current = {
        ...current,
        family_children: current.family_children.filter((child) => child.id !== id),
      };
      return new Response(null, { status: 204 });
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

describe("ProfilePage back navigation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "history", {
      value: { length: 2 },
      writable: true,
      configurable: true,
    });
  });

  it("renders a visible, accessible back control once the profile has loaded and it navigates back", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ csrf_token: "token" }))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const backButton = await screen.findByRole("button", { name: "Zurück" });
    expect(backButton).toBeVisible();
    fireEvent.click(backButton);
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back to the landing page when there is no browser history to go back to", async () => {
    Object.defineProperty(window, "history", {
      value: { length: 1 },
      writable: true,
      configurable: true,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ csrf_token: "token" }))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const backButton = await screen.findByRole("button", { name: "Zurück" });
    fireEvent.click(backButton);
    expect(push).toHaveBeenCalledWith("/");
    expect(back).not.toHaveBeenCalled();
  });

  it("also offers a back control on the unauthenticated state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const backButton = await screen.findByRole("button", { name: "Zurück" });
    fireEvent.click(backButton);
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  });
});

describe("ProfilePage logged-out login link", () => {
  afterEach(() => window.localStorage.clear());

  it("sends a logged-out visitor to their own club's login instead of the generic staff login", async () => {
    window.localStorage.setItem("grillcrew.last-organization-slug", "fc-beispiel");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    expect(await screen.findByRole("link", { name: "Anmelden" })).toHaveAttribute(
      "href",
      "/fc-beispiel",
    );
  });

  it("falls back to the platform root when no organization was ever visited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    expect(await screen.findByRole("link", { name: "Anmelden" })).toHaveAttribute("href", "/");
  });

  it("remembers the organization once the profile loads successfully", async () => {
    vi.stubGlobal("fetch", profileFetch(profile));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    await screen.findByText("FC Beispiel");
    expect(window.localStorage.getItem("grillcrew.last-organization-slug")).toBe("fc-beispiel");
  });
});

describe("ProfilePage branding", () => {
  it("renders the organization's name and logo via AuthCard once loaded", async () => {
    vi.stubGlobal("fetch", profileFetch(profile));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    expect(await screen.findByText("FC Beispiel")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "FC Beispiel Logo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mein Helferprofil" })).toBeInTheDocument();
  });
});

describe("ProfilePage signup status badges", () => {
  it("shows the right human-readable status per signup", async () => {
    vi.stubGlobal("fetch", profileFetch(profile));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const openItem = (await screen.findByText("Senioren 30+")).closest("li")!;
    expect(within(openItem).getByText("Angemeldet")).toBeInTheDocument();

    const cancelledItem = screen.getByText("Junioren C").closest("li")!;
    expect(within(cancelledItem).getByText("Abgemeldet")).toBeInTheDocument();
    expect(
      within(cancelledItem).queryByText("Unentschuldigt nicht erschienen"),
    ).not.toBeInTheDocument();

    const noShowItem = screen.getByText("Herren 1").closest("li")!;
    expect(within(noShowItem).getByText("Unentschuldigt nicht erschienen")).toBeInTheDocument();
  });
});

describe("ProfilePage signup detail links", () => {
  it("links each signup's heading to its own-signup detail page", async () => {
    vi.stubGlobal("fetch", profileFetch(profile));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const openItem = (await screen.findByText("Senioren 30+")).closest("li")!;
    expect(within(openItem).getByRole("link")).toHaveAttribute(
      "href",
      "/profile/signups/signup-open",
    );
  });
});

describe("ProfilePage per-signup compensation", () => {
  it("updates a signup's compensation type via PATCH and reflects the new value", async () => {
    const fetchMock = profileFetch(profile);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const item = (await screen.findByText("Senioren 30+")).closest("li")!;
    const select = within(item).getByLabelText("Einsatzvergütung");
    fireEvent.change(select, { target: { value: "PAYOUT" } });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/api/volunteer/signups/signup-open") &&
            (init as RequestInit | undefined)?.method === "PATCH" &&
            JSON.parse(String((init as RequestInit).body)).compensation_type === "PAYOUT",
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(select).toHaveValue("PAYOUT"));
  });
});

describe("ProfilePage cancel signup", () => {
  it("shows the Absagen button only for still-open signups, regardless of can_cancel", async () => {
    vi.stubGlobal("fetch", profileFetch(profile));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const openItem = (await screen.findByText("Senioren 30+")).closest("li")!;
    expect(
      within(openItem).getByRole("button", { name: 'Einsatz "Senioren 30+" absagen' }),
    ).toBeInTheDocument();
    const deadlineItem = screen.getByText("Damen 1").closest("li")!;
    expect(
      within(deadlineItem).getByRole("button", { name: 'Einsatz "Damen 1" absagen' }),
    ).toBeInTheDocument();
    const noShowItem = screen.getByText("Herren 1").closest("li")!;
    expect(within(noShowItem).queryByRole("button", { name: /absagen/i })).not.toBeInTheDocument();
    const cancelledItem = screen.getByText("Junioren C").closest("li")!;
    expect(
      within(cancelledItem).queryByRole("button", { name: /absagen/i }),
    ).not.toBeInTheDocument();
  });

  it("cancels a signup with the entered reason after confirming in the modal", async () => {
    const fetchMock = profileFetch(profile);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const openItem = (await screen.findByText("Senioren 30+")).closest("li")!;
    fireEvent.click(
      within(openItem).getByRole("button", { name: 'Einsatz "Senioren 30+" absagen' }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Einsatz abmelden" });
    fireEvent.change(within(dialog).getByLabelText("Grund (optional)"), {
      target: { value: "Bin krank" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Abmelden bestätigen" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/api/volunteer/signups/signup-open/cancel") &&
            (init as RequestInit | undefined)?.method === "POST" &&
            JSON.parse(String((init as RequestInit).body)).reason === "Bin krank",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Einsatz abmelden" })).not.toBeInTheDocument(),
    );
  });

  it("shows an error in the modal without closing it when the cancellation is rejected", async () => {
    const fetchMock = profileFetch(profile, { cancelStatus: 409 });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const openItem = (await screen.findByText("Senioren 30+")).closest("li")!;
    fireEvent.click(
      within(openItem).getByRole("button", { name: 'Einsatz "Senioren 30+" absagen' }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Einsatz abmelden" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Abmelden bestätigen" }));
    expect(
      await within(dialog).findByText("Die Frist für die Abmeldung ist abgelaufen."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Einsatz abmelden" })).toBeInTheDocument();
  });

  it("offers WhatsApp and call links to the coordination contact once the deadline has passed", async () => {
    const brandedProfile: VolunteerProfile = {
      ...profile,
      organization: {
        ...organization,
        settings: {
          ...organization.settings,
          coordination_contact_label: "Pascal Kressig",
          coordination_contact_phone: "079 513 44 33",
        },
      },
    };
    vi.stubGlobal("fetch", profileFetch(brandedProfile));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const deadlineItem = (await screen.findByText("Damen 1")).closest("li")!;
    fireEvent.click(
      within(deadlineItem).getByRole("button", { name: 'Einsatz "Damen 1" absagen' }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Kurzfristige Abmeldung" });
    expect(within(dialog).getByText(/kontaktiere Pascal Kressig/)).toBeInTheDocument();
    expect(within(dialog).getByText("Pascal Kressig · 079 513 44 33")).toBeInTheDocument();
    const whatsapp = within(dialog).getByRole("link", { name: "WhatsApp senden" });
    expect(whatsapp).toHaveAttribute("href", expect.stringContaining("https://wa.me/41795134433"));
    const call = within(dialog).getByRole("link", { name: "Anrufen" });
    expect(call).toHaveAttribute("href", "tel:+41795134433");
  });
});

describe("ProfilePage children management", () => {
  it("adds a child and shows it in both the management list and the credited-child selects", async () => {
    const fetchMock = profileFetch(profile);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const section = await screen.findByRole("region", { name: "Kinder verwalten" });
    within(section).getByText("Leo Muster");
    fireEvent.click(within(section).getByRole("button", { name: "Kind hinzufügen" }));
    fireEvent.change(within(section).getByLabelText("Vorname"), { target: { value: "Nina" } });
    fireEvent.change(within(section).getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.click(within(section).getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/api/volunteer/children") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
    await within(section).findByText("Nina Muster");
    const options = screen.getAllByRole("option", { name: "Nina Muster" });
    expect(options.length).toBeGreaterThan(0);
  });

  it("removes a child only after confirming, and not when the confirm is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = profileFetch(profile);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const section = await screen.findByRole("region", { name: "Kinder verwalten" });
    const childItem = within(section).getByText("Leo Muster").closest("li")!;
    fireEvent.click(within(childItem).getByRole("button", { name: "Entfernen" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/api/volunteer/children/child-1") &&
          (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(within(childItem).getByRole("button", { name: "Entfernen" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/api/volunteer/children/child-1") &&
            (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true),
    );
    confirmSpy.mockRestore();
  });
});
