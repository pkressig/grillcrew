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
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/club-years") && method === "GET") return Response.json(empty ? [] : [year]);
    if (url.endsWith("/seasons") && method === "GET")
      return Response.json(empty ? [] : returnedSeasons);
    if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
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
    },
  );

  it("renders fetched records, associations, and German enum labels", async () => {
    renderAdmin("ADMIN");
    expect(await screen.findAllByText("2026/27")).toHaveLength(2);
    expect(screen.getByText("Herbstrunde")).toBeInTheDocument();
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

  it("patches a season status and refreshes the lists", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await screen.findByText("Herbstrunde");
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
    await screen.findByText("Herbstrunde");

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
    await screen.findByText("Herbstrunde");

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
});
