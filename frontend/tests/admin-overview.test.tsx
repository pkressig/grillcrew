import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/app/[org]/admin/admin-shell";
import { AuthProvider } from "@/components/auth-provider";
import { clearCsrfToken } from "@/lib/api";
import type { AuthSession } from "@/lib/auth";
import { platformFallbackOrganization } from "@/lib/organization";
import type { PlanningEvent, Shift } from "@/lib/planning";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const session = (role: "ADMIN" | "KOORDINATION" | "KIOSK" = "ADMIN"): AuthSession => ({
  user: {
    id: "user-1",
    email_normalized: "staff@example.test",
    display_name: "Staff",
    status: "ACTIVE",
  },
  memberships: [
    { organization_id: "org-1", organization_slug: "example", organization_name: "Example", role },
  ],
});

const events: PlanningEvent[] = [
  {
    id: "later",
    season_id: "season-1",
    title: "Später Anlass",
    date: "2026-08-10",
    location: "Platz B",
    event_type: "GRILL",
    public_description: null,
    internal_note: null,
    status: "PUBLISHED",
    published_at: null,
  },
  {
    id: "soon",
    season_id: "season-1",
    title: "Nächster Anlass",
    date: "2026-08-02",
    location: "Platz A",
    event_type: "GRILL",
    public_description: null,
    internal_note: null,
    status: "PUBLISHED",
    published_at: null,
  },
];

function shift(
  id: string,
  eventId: string,
  startsAt: string,
  endsAt: string,
  openPlaces: number,
  signupOpen = false,
): Shift {
  return {
    id,
    event_id: eventId,
    starts_at: startsAt,
    ends_at: endsAt,
    required_volunteers: 3,
    occupied_volunteers: 3 - openPlaces,
    open_places: openPlaces,
    public_note: null,
    internal_note: null,
    status: "OPEN",
    sort_order: 0,
    shift_type: "GRILL",
    assignment_mode: "OPEN_SIGNUP",
    menu_type: null,
    crew_suggestion_overridden: false,
    signups: signupOpen
      ? [
          {
            id: `signup-${id}`,
            public_name: "Mia Muster",
            first_name: "Mia",
            last_name: "Muster",
            phone: "private",
            email: "private@example.test",
            outcome: "OPEN",
            created_at: "2026-07-01T08:00:00Z",
          },
        ]
      : [],
  };
}

function overviewFetch(role: "ADMIN" | "KOORDINATION" | "KIOSK" = "ADMIN", empty = false) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "token" });
    if (url.endsWith("/club-years")) return Response.json([]);
    if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
    if (url.endsWith("/seasons"))
      return Response.json(
        empty
          ? []
          : [
              {
                id: "season-1",
                club_year_id: "year-1",
                type: "AUTUMN",
                name: "Herbst",
                start_date: "2026-07-01",
                end_date: "2026-12-31",
                status: "ACTIVE",
              },
            ],
      );
    if (url.endsWith("/seasons/season-1/events")) return Response.json(events);
    if (url.endsWith("/seasons/season-1/events-with-shifts"))
      return Response.json(
        events.map((event) => ({
          ...event,
          shifts:
            event.id === "soon"
              ? [
                  shift("past", "soon", "2026-07-20T08:00:00Z", "2026-07-20T10:00:00Z", 0, true),
                  shift("next", "soon", "2026-08-02T08:00:00Z", "2026-08-02T10:00:00Z", 2),
                ]
              : [shift("later", "later", "2026-08-10T08:00:00Z", "2026-08-10T10:00:00Z", 1)],
        })),
      );
    if (url.endsWith("/families"))
      return Response.json(empty ? [] : [{ id: "family-1" }, { id: "family-2" }]);
    return new Response(null, { status: 404 });
  });
}

function renderOverview(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <AuthProvider>
      <AdminShell activeView="overview" org="example" organization={platformFallbackOrganization} />
    </AuthProvider>,
  );
}

beforeEach(() => vi.setSystemTime(new Date("2026-07-29T12:00:00Z")));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCsrfToken();
});

describe("admin overview", () => {
  it.each(["ADMIN", "KOORDINATION"] as const)(
    "renders real organization data for %s",
    async (role) => {
      const fetchMock = overviewFetch(role);
      renderOverview(fetchMock);
      expect(screen.getByRole("heading", { name: "Sitzung wird geladen" })).toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Übersicht" })).toBeInTheDocument();
      await screen.findAllByText("Nächster Anlass");
      const summary = screen.getByLabelText("Organisationsübersicht");
      expect(within(summary).getByText("Bevorstehende Anlässe").nextSibling).toHaveTextContent("2");
      expect(within(summary).getByText("Bevorstehende Einsätze").nextSibling).toHaveTextContent(
        "2",
      );
      expect(within(summary).getByText("Offene Plätze").nextSibling).toHaveTextContent("3");
      expect(within(summary).getByText("Aktive Familien").nextSibling).toHaveTextContent("2");
      expect(
        screen
          .getAllByText("Nächster Anlass")[0]!
          .compareDocumentPosition(screen.getAllByText("Später Anlass")[0]!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getByText("Mia Muster")).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: "Planung" })[0]).toHaveAttribute(
        "href",
        "/example/admin/planning",
      );
      expect(screen.getAllByRole("link", { name: "Anwesenheit" })[0]).toHaveAttribute(
        "href",
        "/example/admin/attendance",
      );
      expect(screen.getAllByRole("link", { name: "Helfer" })[0]).toHaveAttribute(
        "href",
        "/example/admin/families",
      );
      expect(screen.getAllByRole("link", { name: "Übersicht" })[0]).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/admin/"))).toSatisfy(
        (calls: unknown[][]) => calls.every(([url]) => String(url).includes("/api/admin/example/")),
      );
    },
  );

  it("renders honest empty states without event or shift requests", async () => {
    const fetchMock = overviewFetch("ADMIN", true);
    renderOverview(fetchMock);
    expect(await screen.findByText("Keine bevorstehenden Anlässe vorhanden.")).toBeInTheDocument();
    expect(screen.getByText("Keine bevorstehenden Einsätze vorhanden.")).toBeInTheDocument();
    expect(screen.getByText("Keine offenen Anwesenheiten vorhanden.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => /\/events|\/shifts/.test(String(url)))).toBe(false);
  });

  it("shows a retryable error state", async () => {
    const normalFetch = overviewFetch();
    let failed = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (!failed && String(input).endsWith("/club-years")) {
        failed = true;
        return new Response(null, { status: 500 });
      }
      return normalFetch(input);
    });
    renderOverview(fetchMock);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Übersicht konnte nicht geladen werden",
    );
    const retry = screen.getByRole("button", { name: "Erneut versuchen" });
    expect(retry).toHaveClass("min-h-11");
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText("Aktive Familien")).toBeInTheDocument());
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/club-years")),
    ).toHaveLength(2);
  });

  it("does not load overview data for a role without management permission", async () => {
    const fetchMock = overviewFetch("KIOSK");
    renderOverview(fetchMock);
    expect(await screen.findByRole("heading", { name: "keine Berechtigung" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/admin/"))).toBe(false);
  });
});
