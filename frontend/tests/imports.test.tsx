import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/app/[org]/admin/admin-shell";
import { AuthProvider } from "@/components/auth-provider";
import { clearCsrfToken } from "@/lib/api";
import type { AuthSession, StaffRole } from "@/lib/auth";
import { platformFallbackOrganization } from "@/lib/organization";
import { loadOneDriveConfig } from "@/lib/onedrive-sync";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/onedrive-sync", () => ({
  loadOneDriveConfig: vi.fn().mockResolvedValue(null),
  saveOneDriveConfig: vi.fn(),
  syncOneDriveNow: vi.fn(),
}));

const clubYear = {
  id: "cy-1",
  label: "2026/2027",
  start_date: "2026-07-01",
  end_date: "2027-06-30",
  status: "ACTIVE",
};

const neuRow = {
  id: "row-1",
  import_batch_id: "batch-1",
  season_id: "season-1",
  sheet_tab: "HR 2026 2027",
  spiel_typ: "MEISTERSCHAFT",
  bezeichnung: "FCTC Herren 1",
  spielnummer: "119550",
  weekday_short: "Sa",
  game_date: "2026-08-15",
  game_time: "17:00:00",
  teams: "FC Thusis/Cazis 1 - FC Lusitanos",
  venue: "St. Martin, Cazis - Platz 1",
  venue_normalized: "st. martin, cazis - platz 1",
  remark: null,
  is_home_venue: true,
  classification: "NEU",
  matched_event_id: null,
  diff_details: null,
  include_decision: "INCLUDE",
  grill_shift_decision: "PENDING",
  verschoben_acknowledged_at: null,
  applied_at: null,
  created_at: "2026-07-31T10:00:00Z",
  updated_at: "2026-07-31T10:00:00Z",
};

const verschobenRow = {
  ...neuRow,
  id: "row-2",
  classification: "VERSCHOBEN",
  diff_details: { game_date: { old: "2026-08-22", new: "2026-08-15" } },
  matched_event_id: "event-1",
};

const entferntRow = {
  ...neuRow,
  id: "row-3",
  classification: "ENTFERNT",
  matched_event_id: "event-2",
};

const stagedBatch = {
  id: "batch-1",
  organization_id: "org-1",
  club_year_id: "cy-1",
  source_filename: "spielplan.xlsx",
  uploaded_by_user_id: "user-1",
  status: "STAGED",
  uploaded_at: "2026-07-31T10:00:00Z",
  confirmed_at: null,
  confirmed_by_user_id: null,
  row_count: 3,
  created_at: "2026-07-31T10:00:00Z",
  updated_at: "2026-07-31T10:00:00Z",
};

function session(role: StaffRole): AuthSession {
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

function importsFetch(role: StaffRole) {
  let rows: Record<string, unknown>[] = [neuRow, verschobenRow, entferntRow];
  let batch: Record<string, unknown> = stagedBatch;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "csrf-memory" });
    if (url.endsWith("/club-years")) return Response.json([clubYear]);
    if (url.endsWith("/seasons")) return Response.json([]);
    if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
    if (url.endsWith("/imports") && method === "POST")
      return Response.json({ batch, rows }, { status: 201 });
    if (url.endsWith("/imports/batch-1/rows") && method === "GET")
      return Response.json({ batch, rows });
    if (url.endsWith("/imports/batch-1/rows/row-2") && method === "PATCH") {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      rows = rows.map((row) => (row.id === "row-2" ? { ...row, ...payload } : row));
      return Response.json(rows[1]);
    }
    if (url.endsWith("/imports/batch-1/confirm") && method === "POST") {
      batch = { ...batch, status: "CONFIRMED", confirmed_at: "2026-07-31T11:00:00Z" };
      rows = rows.map((row) => ({ ...row, applied_at: "2026-07-31T11:00:00Z" }));
      return Response.json({ batch, rows });
    }
    return new Response(null, { status: 404 });
  });
}

function renderAdmin(role: StaffRole, activeView: "import" | "families" = "import") {
  const fetchMock = importsFetch(role);
  vi.stubGlobal("fetch", fetchMock);
  render(
    <AuthProvider>
      <AdminShell
        activeView={activeView}
        org="example"
        organization={platformFallbackOrganization}
      />
    </AuthProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.cookie = "gc_csrf=; Max-Age=0";
  clearCsrfToken();
  window.history.replaceState({}, "", "/");
});

describe("import admin navigation and role gating", () => {
  it("shows the Spielplan-Import nav link only for ADMIN", async () => {
    renderAdmin("ADMIN");
    await screen.findByRole("heading", { name: "Spielplan-Import" });
    expect(screen.getAllByRole("link", { name: "Spielplan-Import" })[0]).toHaveAttribute(
      "href",
      "/example/admin/import",
    );
  });

  it("does not mount OneDrive synchronization outside the import workspace", async () => {
    renderAdmin("KOORDINATION", "families");
    await screen.findByRole("heading", { name: "Helfer" });
    expect(loadOneDriveConfig).not.toHaveBeenCalled();
  });

  it("hides the nav link and denies direct access for KOORDINATION", async () => {
    renderAdmin("KOORDINATION", "families");
    await screen.findByRole("heading", { name: "Helfer" });
    expect(screen.queryByRole("link", { name: "Spielplan-Import" })).not.toBeInTheDocument();
  });

  it("denies KOORDINATION direct access to the import view", async () => {
    renderAdmin("KOORDINATION");
    expect(await screen.findByText("keine Berechtigung")).toBeInTheDocument();
  });
});

async function uploadFile(fetchMock: ReturnType<typeof importsFetch>) {
  await screen.findByLabelText("Vereinsjahr");
  const fileInput = screen.getByLabelText("Heimspielplan (Excel-Datei)");
  const file = new File(["dummy"], "spielplan.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  fireEvent.change(fileInput, { target: { files: [file] } });
  const form = screen.getByRole("button", { name: "Datei hochladen und prüfen" }).closest("form");
  if (!form) throw new Error("upload form not found");
  fireEvent.submit(form);
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/imports") && (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(true),
  );
}

describe("import upload and diff review", () => {
  it("uploads a file and shows the grouped diff review", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await uploadFile(fetchMock);
    await screen.findByText("spielplan.xlsx");
    expect(screen.getByText("Neu (1)")).toBeInTheDocument();
    expect(screen.getByText("Verschoben (1)")).toBeInTheDocument();
    expect(screen.getAllByText(/FC Thusis\/Cazis 1 - FC Lusitanos/).length).toBeGreaterThan(0);

    const statSummary = screen.getByLabelText("Übersicht nach Klassifikation");
    expect(within(statSummary).getByText("Neu")).toBeInTheDocument();
    expect(within(statSummary).getByText("Entfernt")).toBeInTheDocument();
  });

  it("marks a verschoben row as acknowledged", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await uploadFile(fetchMock);
    const verschobenSection = screen.getByText("Verschoben (1)").closest("section");
    if (!verschobenSection) throw new Error("verschoben section not found");
    fireEvent.click(
      within(verschobenSection).getByRole("button", { name: "Als erledigt markieren" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/imports/batch-1/rows/row-2") &&
            (init as RequestInit | undefined)?.method === "PATCH",
        ),
      ).toBe(true),
    );
  });

  it("makes decisions read-only for removed rows", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await uploadFile(fetchMock);
    const removedSection = screen.getByText("Entfernt (1)").closest("section");
    if (!removedSection) throw new Error("removed section not found");

    expect(within(removedSection).getByLabelText("Übernehmen")).toBeDisabled();
    expect(within(removedSection).getByLabelText("Grill-Einsatz?")).toBeDisabled();
  });

  it("confirms the batch after a confirmation dialog", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = renderAdmin("ADMIN");
    await uploadFile(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Import übernehmen" }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/imports/batch-1/confirm") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Import wurde übernommen.")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("does not confirm when the dialog is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = renderAdmin("ADMIN");
    await uploadFile(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Import übernehmen" }));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/imports/batch-1/confirm") &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
    confirmSpy.mockRestore();
  });
});
