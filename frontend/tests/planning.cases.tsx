import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/app/[org]/admin/admin-shell";
import { AuthProvider } from "@/components/auth-provider";
import type { AuthSession } from "@/lib/auth";
import { platformFallbackOrganization } from "@/lib/organization";

const year = {
  id: "year-1",
  label: "2026/27",
  start_date: "2026-07-01",
  end_date: "2027-06-30",
  status: "DRAFT",
  created_at: "",
  updated_at: "",
};
const season = {
  id: "season-1",
  club_year_id: "year-1",
  type: "AUTUMN",
  name: "Herbstrunde",
  start_date: "2026-08-01",
  end_date: "2026-12-15",
  status: "DRAFT",
  created_at: "",
  updated_at: "",
};
const secondSeason = {
  ...season,
  id: "season-2",
  name: "Frühlingsrunde",
};
const planningEvent = {
  id: "event-1",
  season_id: "season-1",
  title: "Sommerfest",
  date: "2026-09-12",
  location: "Sportplatz",
  event_type: "Vereinsanlass",
  public_description: "Fest für alle",
  internal_note: "Aufbau ab Mittag",
  status: "PUBLISHED",
  published_at: "2026-07-01T10:00:00Z",
};
const secondPlanningEvent = {
  ...planningEvent,
  id: "event-2",
  title: "Heimspieltag",
};
const shift = {
  id: "shift-1",
  event_id: "event-1",
  starts_at: "2026-09-12T16:00:00Z",
  ends_at: "2026-09-12T18:00:00Z",
  required_volunteers: 3,
  public_note: "Bitte frühzeitig melden",
  internal_note: "Kasse bereitstellen",
  status: "OPEN",
  sort_order: 0,
};

function session(role: "ADMIN" | "KOORDINATION" | "KIOSK" | "VORSTAND_LESEN"): AuthSession {
  return {
    user: {
      id: "user-1",
      email_normalized: "staff@example.test",
      display_name: "Staff",
      status: "ACTIVE",
    },
    memberships: [
      {
        organization_id: "org-1",
        organization_slug: "example",
        organization_name: "Example Org",
        role,
      },
    ],
  };
}

function planningFetch(
  role: Parameters<typeof session>[0],
  empty = false,
  returnedSeasons = [season],
  includeEvents = false,
  includeShifts = includeEvents,
  returnedEvents = includeEvents ? [planningEvent] : [],
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/club-years") && method === "GET") return Response.json(empty ? [] : [year]);
    if (url.endsWith("/seasons") && method === "GET")
      return Response.json(empty ? [] : returnedSeasons);
    if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
    if (url.endsWith("/seasons/season-1/events") && method === "GET")
      return Response.json(returnedEvents);
    if (url.endsWith("/events/event-1/shifts") && method === "GET")
      return Response.json(includeShifts ? [shift] : []);
    if (url.endsWith("/events/event-2/shifts") && method === "GET") return Response.json([]);
    if (method === "POST" || method === "PATCH")
      return Response.json(method === "PATCH" ? { ...season, status: "ACTIVE" } : year, {
        status: method === "POST" ? 201 : 200,
      });
    return new Response(null, { status: 404 });
  });
}

function renderAdmin(role: Parameters<typeof session>[0], fetchMock = planningFetch(role)) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <AuthProvider>
      <AdminShell org="example" organization={platformFallbackOrganization} />
    </AuthProvider>,
  );
  return fetchMock;
}

function openEventForm() {
  fireEvent.click(screen.getByText("Anlass erstellen", { selector: "summary" }));
}

function openShiftForm(eventTitle: string) {
  const eventHeading = screen.getByRole("heading", { name: eventTitle });
  const eventItem = eventHeading.closest("li");
  const summary = eventItem?.querySelector("summary");
  expect(summary).not.toBeNull();
  fireEvent.click(summary!);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.cookie = "gc_csrf=; Max-Age=0";
});

describe("planning admin", () => {
  it.each(["ADMIN", "KOORDINATION"] as const)("shows management controls for %s", async (role) => {
    renderAdmin(role);
    expect(await screen.findByRole("heading", { name: "Planung" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vereinsjahr erstellen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saison erstellen" })).toBeInTheDocument();
    expect(screen.getByText("Anlass erstellen", { selector: "summary" })).toBeInTheDocument();
  });

  it.each(["KIOSK", "VORSTAND_LESEN"] as const)(
    "hides management controls for %s",
    async (role) => {
      const fetchMock = renderAdmin(role);
      expect(await screen.findByText(/keine Berechtigung/)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Vereinsjahr erstellen" }),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls.some(([url]) => /\/events|\/shifts/.test(String(url)))).toBe(
        false,
      );
    },
  );

  it("renders fetched records, associations, and German enum labels", async () => {
    renderAdmin("ADMIN");
    expect(await screen.findAllByText("2026/27")).toHaveLength(2);
    expect(screen.getAllByText("Herbstrunde").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 Saisons/)).toBeInTheDocument();
    expect(screen.getAllByText("Herbst")).toHaveLength(1);
    expect(screen.getAllByText("Entwurf")).toHaveLength(2);
    expect(screen.getByText("Vereinsjahr: 2026/27")).toBeInTheDocument();
  });

  it("renders planning empty states", async () => {
    renderAdmin("ADMIN", planningFetch("ADMIN", true));
    expect(await screen.findByText("Noch keine Vereinsjahre vorhanden.")).toBeInTheDocument();
    expect(screen.getByText("Noch keine Saisons vorhanden.")).toBeInTheDocument();
    expect(screen.getByText("Derzeit ist keine Saison aktiv.")).toBeInTheDocument();
    expect(
      screen.getByText("Erstellen Sie zuerst eine Saison, bevor Sie Anlässe planen."),
    ).toBeInTheDocument();
  });

  it("renders events and shifts with human-readable status labels", async () => {
    renderAdmin("ADMIN", planningFetch("ADMIN", false, [season], true));

    expect(await screen.findByText("Sommerfest")).toBeInTheDocument();
    expect(screen.getByText("Veröffentlicht")).toBeInTheDocument();
    expect(screen.getByText("Offen")).toBeInTheDocument();
    expect(screen.getByText("3 benötigte Helfende")).toBeInTheDocument();
    expect(screen.getByText("Öffentlich: Bitte frühzeitig melden")).toBeInTheDocument();
  });

  it("renders clear event and shift empty states", async () => {
    renderAdmin("ADMIN");
    expect(
      await screen.findByText("In dieser Saison sind noch keine Anlässe vorhanden."),
    ).toBeInTheDocument();

    cleanup();
    renderAdmin("ADMIN", planningFetch("ADMIN", false, [season], true, false));
    expect(
      await screen.findByText("Für diesen Anlass sind noch keine Einsätze vorhanden."),
    ).toBeInTheDocument();
  });

  it("creates a club year with credentials and a CSRF header", async () => {
    document.cookie = "gc_csrf=test-token";
    const fetchMock = renderAdmin("ADMIN");
    await screen.findAllByText("2026/27");
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "2027/28" } });
    const dates = screen.getAllByLabelText(/datum/);
    fireEvent.change(dates[0]!, { target: { value: "2027-07-01" } });
    fireEvent.change(dates[1]!, { target: { value: "2028-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Vereinsjahr erstellen" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/admin\/example\/club-years$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({ "X-CSRF-Token": "test-token" }),
          body: JSON.stringify({
            label: "2027/28",
            start_date: "2027-07-01",
            end_date: "2028-06-30",
            status: "DRAFT",
          }),
        }),
      ),
    );
  });

  it("creates a season in the selected club year", async () => {
    const fetchMock = renderAdmin("KOORDINATION");
    await screen.findAllByText("2026/27");
    fireEvent.change(screen.getByLabelText("Vereinsjahr"), { target: { value: "year-1" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FrÃ¼hlingsrunde" } });
    const dates = screen.getAllByLabelText(/datum/);
    fireEvent.change(dates[2]!, { target: { value: "2027-02-01" } });
    fireEvent.change(dates[3]!, { target: { value: "2027-06-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Saison erstellen" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/club-years\/year-1\/seasons$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            type: "AUTUMN",
            name: "FrÃ¼hlingsrunde",
            start_date: "2027-02-01",
            end_date: "2027-06-15",
            status: "DRAFT",
          }),
        }),
      ),
    );
  });

  it("creates an event with credentials and a CSRF header", async () => {
    document.cookie = "gc_csrf=event-token";
    const fetchMock = renderAdmin("ADMIN");
    await screen.findByText("In dieser Saison sind noch keine Anlässe vorhanden.");
    openEventForm();
    fireEvent.change(screen.getByLabelText("Anlass-Saison"), {
      target: { value: "season-1" },
    });
    fireEvent.change(screen.getByLabelText("Anlasstitel"), { target: { value: "Cupspiel" } });
    fireEvent.change(screen.getByLabelText("Anlassdatum"), {
      target: { value: "2026-10-03" },
    });
    fireEvent.change(screen.getByLabelText("Ort"), { target: { value: "Sportplatz" } });
    fireEvent.change(screen.getByLabelText("Anlassart"), { target: { value: "Heimspiel" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlass erstellen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/seasons\/season-1\/events$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-CSRF-Token": "event-token",
          }),
          body: JSON.stringify({
            title: "Cupspiel",
            date: "2026-10-03",
            location: "Sportplatz",
            event_type: "Heimspiel",
            public_description: null,
            internal_note: null,
            status: "DRAFT",
          }),
        }),
      ),
    );
  });

  it("creates a shift with credentials and a CSRF header", async () => {
    document.cookie = "gc_csrf=shift-token";
    const fetchMock = renderAdmin(
      "KOORDINATION",
      planningFetch("KOORDINATION", false, [season], true),
    );
    await screen.findByText("Sommerfest");
    openShiftForm("Sommerfest");
    fireEvent.change(screen.getByLabelText("Beginn"), {
      target: { value: "2026-09-12T18:00" },
    });
    fireEvent.change(screen.getByLabelText("Ende"), {
      target: { value: "2026-09-12T20:00" },
    });
    fireEvent.change(screen.getByLabelText("Benötigte Helfende"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Einsatz für Sommerfest erstellen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/events\/event-1\/shifts$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-CSRF-Token": "shift-token",
          }),
          body: JSON.stringify({
            starts_at: "2026-09-12T16:00:00.000Z",
            ends_at: "2026-09-12T18:00:00.000Z",
            required_volunteers: 4,
            public_note: null,
            internal_note: null,
            status: "OPEN",
            sort_order: 0,
          }),
        }),
      ),
    );
  });

  it("preserves event form input after a failed submission", async () => {
    const baseFetch = planningFetch("ADMIN");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/seasons/season-1/events") && init?.method === "POST")
        return new Response(null, { status: 422 });
      return baseFetch(input, init);
    });
    renderAdmin("ADMIN", fetchMock);
    await screen.findByText("In dieser Saison sind noch keine Anlässe vorhanden.");
    openEventForm();
    fireEvent.change(screen.getByLabelText("Anlass-Saison"), {
      target: { value: "season-1" },
    });
    fireEvent.change(screen.getByLabelText("Anlasstitel"), {
      target: { value: "Eingabe behalten" },
    });
    fireEvent.change(screen.getByLabelText("Anlassdatum"), {
      target: { value: "2026-10-03" },
    });
    fireEvent.change(screen.getByLabelText("Ort"), { target: { value: "Dorfplatz" } });
    fireEvent.change(screen.getByLabelText("Anlassart"), { target: { value: "Fest" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlass erstellen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Anlass konnte nicht erstellt werden.",
    );
    expect(screen.getByLabelText("Anlasstitel")).toHaveValue("Eingabe behalten");
  });

  it("does not cancel an event when confirmation is declined", async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    const fetchMock = renderAdmin("ADMIN", planningFetch("ADMIN", false, [season], true));
    await screen.findByText("Sommerfest");
    fireEvent.click(screen.getByRole("button", { name: "Anlass Sommerfest absagen" }));

    expect(confirmMock).toHaveBeenCalledWith(
      'Anlass "Sommerfest" wirklich als abgesagt markieren?',
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("does not cancel a shift when confirmation is declined", async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    const fetchMock = renderAdmin("ADMIN", planningFetch("ADMIN", false, [season], true, true));
    await screen.findByText("Sommerfest");
    const shiftTime = new Intl.DateTimeFormat("de-CH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Zurich",
    }).format(new Date(shift.starts_at));
    fireEvent.click(
      screen.getByRole("button", { name: `Einsatz ${shiftTime} für Sommerfest absagen` }),
    );

    expect(confirmMock).toHaveBeenCalledWith('Einsatz für "Sommerfest" wirklich absagen?');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("patches a season status and refreshes the lists", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await screen.findAllByText("Herbstrunde");
    fireEvent.click(screen.getByRole("button", { name: "Saison Herbstrunde aktivieren" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/seasons\/season-1$/),
        expect.objectContaining({
          method: "PATCH",
          credentials: "include",
          body: JSON.stringify({ status: "ACTIVE" }),
        }),
      ),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/club-years")),
      ).toHaveLength(2),
    );
  });

  it("does not close a season when confirmation is cancelled", async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    const fetchMock = renderAdmin("ADMIN");
    await screen.findAllByText("Herbstrunde");

    fireEvent.click(screen.getByRole("button", { name: "Saison Herbstrunde schliessen" }));

    expect(confirmMock).toHaveBeenCalledWith(
      'Saison "Herbstrunde" wirklich schliessen? Danach sind nur noch eingeschränkte Änderungen möglich.',
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("archives a season after confirmation", async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    const fetchMock = renderAdmin("ADMIN");
    await screen.findAllByText("Herbstrunde");

    fireEvent.click(screen.getByRole("button", { name: "Saison Herbstrunde archivieren" }));

    expect(confirmMock).toHaveBeenCalledWith(
      'Saison "Herbstrunde" wirklich archivieren? Archivierte Saisons können nicht mehr bearbeitet werden.',
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/seasons\/season-1$/),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "ARCHIVED" }),
        }),
      ),
    );
  });

  it("gives repeated lifecycle buttons unique accessible names", async () => {
    renderAdmin("ADMIN", planningFetch("ADMIN", false, [season, secondSeason]));

    expect(
      await screen.findByRole("button", { name: "Saison Herbstrunde schliessen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Saison Frühlingsrunde schliessen" }),
    ).toBeInTheDocument();
  });

  it("makes event creation discoverable with explicitly associated labels", async () => {
    renderAdmin("ADMIN");
    await screen.findByText("In dieser Saison sind noch keine Anlässe vorhanden.");

    const summary = screen.getByText("Anlass erstellen", { selector: "summary" });
    expect(summary).toBeInTheDocument();
    openEventForm();

    expect(screen.getByLabelText("Anlass-Saison")).toHaveAttribute("id", "create-event-season");
    expect(screen.getByLabelText("Anlasstitel")).toHaveAttribute("id", "create-event-title");
  });

  it("gives repeated create-shift buttons unique accessible names and input IDs", async () => {
    renderAdmin(
      "ADMIN",
      planningFetch("ADMIN", false, [season], true, true, [planningEvent, secondPlanningEvent]),
    );
    await screen.findByText("Heimspieltag");
    openShiftForm("Sommerfest");
    openShiftForm("Heimspieltag");

    expect(
      screen.getByRole("button", { name: "Einsatz für Sommerfest erstellen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Einsatz für Heimspieltag erstellen" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Beginn").map((input) => input.id)).toEqual([
      "shift-event-1-starts-at",
      "shift-event-2-starts-at",
    ]);
  });
});
