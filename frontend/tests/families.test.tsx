import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/app/[org]/admin/admin-shell";
import { AuthProvider } from "@/components/auth-provider";
import { clearCsrfToken } from "@/lib/api";
import type { AuthSession, StaffRole } from "@/lib/auth";
import { platformFallbackOrganization } from "@/lib/organization";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const family = {
  id: "family-1",
  organization_id: "org-1",
  display_name: "Familie Muster",
  status: "ACTIVE",
  internal_note: "Nur intern",
  created_at: "2026-07-28T10:00:00Z",
  updated_at: "2026-07-28T10:00:00Z",
  children_count: 1,
  helpers_count: 1,
};
const member = {
  id: "member-1",
  family_id: "family-1",
  member_type: "HELPER",
  first_name: "Mia",
  last_name: "Andere",
  volunteer_id: null,
  team_name: null,
};

const directoryVolunteer = {
  id: "volunteer-1",
  first_name: "Anna",
  last_name: "Zeta",
  phone: "079 111 11 11",
  email: "anna@example.invalid",
  compensation_preference: "WORK_HOURS",
  compensation_family_member_id: null,
  internal_note: null,
  status: "ACTIVE",
  has_account: true,
  family_display_name: "Familie Muster",
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

type FetchOptions = {
  familyResponses?: Response[];
  memberResponses?: Response[];
  familyVolunteersResponses?: Response[];
  allVolunteersResponses?: Response[];
  volunteerFamilyResponses?: Response[];
  deleteVolunteerResponse?: Response;
  extra?: (url: string, init: RequestInit | undefined) => Response | undefined;
};

function adminFetch(role: StaffRole, options: FetchOptions = {}) {
  const familyResponses = options.familyResponses ?? [Response.json([])];
  const memberResponses = options.memberResponses ?? [Response.json([])];
  const familyVolunteersResponses = options.familyVolunteersResponses ?? [Response.json([])];
  const allVolunteersResponses = options.allVolunteersResponses ?? [Response.json([])];
  const volunteerFamilyResponses = options.volunteerFamilyResponses ?? [Response.json(null)];
  let familyIndex = 0;
  let memberIndex = 0;
  let familyVolunteersIndex = 0;
  let allVolunteersIndex = 0;
  let volunteerFamilyIndex = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "csrf-memory" });
    const custom = options.extra?.(url, init);
    if (custom) return custom;
    if (url.endsWith("/families/all-volunteers") && method === "GET")
      return allVolunteersResponses[
        Math.min(allVolunteersIndex++, allVolunteersResponses.length - 1)
      ]!;
    if (url.endsWith("/families/volunteers") && method === "GET")
      return familyVolunteersResponses[
        Math.min(familyVolunteersIndex++, familyVolunteersResponses.length - 1)
      ]!;
    if (url.endsWith("/families/volunteers") && method === "POST")
      return Response.json(directoryVolunteer, { status: 201 });
    if (url.endsWith("/families") && method === "GET")
      return familyResponses[Math.min(familyIndex++, familyResponses.length - 1)]!;
    if (url.endsWith("/families") && method === "POST")
      return Response.json(family, { status: 201 });
    if (url.endsWith("/families/family-1/members") && method === "GET")
      return memberResponses[Math.min(memberIndex++, memberResponses.length - 1)]!;
    if (url.endsWith("/families/family-1/members") && method === "POST")
      return Response.json(member, { status: 201 });
    if (url.endsWith("/families/family-1/members/member-1/volunteer") && method === "PATCH") {
      const volunteerId = JSON.parse(String(init?.body)).volunteer_id as string | null;
      return Response.json({ ...member, volunteer_id: volunteerId });
    }
    if (url.includes("/families/volunteers/") && url.endsWith("/family") && method === "GET")
      return volunteerFamilyResponses[
        Math.min(volunteerFamilyIndex++, volunteerFamilyResponses.length - 1)
      ]!;
    if (url.includes("/families/volunteers/") && url.endsWith("/send-password-reset"))
      return Response.json({ ok: true }, { status: 202 });
    if (url.includes("/families/volunteers/") && url.endsWith("/set-password"))
      return Response.json({ ok: true });
    if (url.includes("/families/volunteers/") && method === "DELETE")
      return options.deleteVolunteerResponse ?? new Response(null, { status: 204 });
    if (url.includes("/families/volunteers/") && method === "PATCH") {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ id: url.split("/").at(-1), ...payload });
    }
    if (url.endsWith("/families/family-2/members") && method === "GET") return Response.json([]);
    if (url.endsWith("/club-years") || url.endsWith("/seasons")) return Response.json([]);
    if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
    return new Response(null, { status: 404 });
  });
}

function renderAdmin(role: StaffRole, fetchMock = adminFetch(role)) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <AuthProvider>
      <AdminShell activeView="families" org="example" organization={platformFallbackOrganization} />
    </AuthProvider>,
  );
  return fetchMock;
}

async function openFamilienTab() {
  fireEvent.click(await screen.findByRole("tab", { name: "Familien" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.cookie = "gc_csrf=; Max-Age=0";
  clearCsrfToken();
  window.history.replaceState({}, "", "/");
});

describe("volunteer (Helfer) admin — primary view", () => {
  it("defaults to the Helfer tab with skip link and accessible nav chrome", async () => {
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { allVolunteersResponses: [Response.json([directoryVolunteer])] }),
    );
    await screen.findByRole("heading", { name: "Helfer" });
    expect(screen.getByText("Zum Inhalt")).toHaveAttribute("href", "#admin-content");
    expect(screen.getAllByRole("link", { name: "Helfer" })[0]).toHaveAttribute(
      "aria-current",
      "page",
    );
    const helferTab = screen.getByRole("tab", { name: "Helfer" });
    const familienTab = screen.getByRole("tab", { name: "Familien" });
    expect(helferTab).toHaveAttribute("aria-selected", "true");
    expect(familienTab).toHaveAttribute("aria-selected", "false");
  });

  it("lists volunteers with family and status badges, searches, and shows empty/no-results states", async () => {
    const inactive = {
      ...directoryVolunteer,
      id: "volunteer-2",
      first_name: "Berta",
      last_name: "Keller",
      status: "INACTIVE",
      family_display_name: null,
    };
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        allVolunteersResponses: [Response.json([directoryVolunteer, inactive])],
      }),
    );
    const row = (await screen.findByRole("button", { name: "Anna Zeta" })).closest("tr")!;
    expect(row).toHaveTextContent("Familie Muster");
    expect(row).toHaveTextContent("Aktiv");
    const inactiveRow = screen.getByRole("button", { name: "Berta Keller" }).closest("tr")!;
    expect(inactiveRow).toHaveTextContent("Inaktiv");

    fireEvent.change(screen.getByLabelText("Helfer suchen"), { target: { value: "berta" } });
    expect(screen.queryByRole("button", { name: "Anna Zeta" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Berta Keller" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Helfer suchen"), { target: { value: "Niemand" } });
    expect(screen.getByText("Keine Helfer für diese Suche gefunden.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suche löschen" }));
    expect(screen.getByRole("button", { name: "Anna Zeta" })).toBeInTheDocument();
  });

  it("shows loading and empty states for the volunteer list", async () => {
    let resolveVolunteers!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveVolunteers = resolve;
    });
    const base = adminFetch("ADMIN");
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/families/all-volunteers") ? pending : base(input, init),
    );
    renderAdmin("ADMIN", fetchMock);
    expect(await screen.findByText("Helfer werden geladen …")).toBeInTheDocument();
    resolveVolunteers(Response.json([]));
    expect(await screen.findByText("Noch keine Helfer vorhanden.")).toBeInTheDocument();
  });

  it("selects a volunteer, edits full Kartei fields including email, and saves with CSRF", async () => {
    document.cookie = "gc_csrf=kartei-token";
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { allVolunteersResponses: [Response.json([directoryVolunteer])] }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    expect(await screen.findByLabelText("E-Mail")).toHaveValue("anna@example.invalid");
    fireEvent.change(screen.getByLabelText("E-Mail"), {
      target: { value: "anna.neu@example.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/families\/volunteers\/volunteer-1$/),
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({ "X-CSRF-Token": "kartei-token" }),
          body: expect.stringContaining('"email":"anna.neu@example.invalid"'),
        }),
      ),
    );
  });

  it("creates a new volunteer directly with required-field validation and CSRF", async () => {
    document.cookie = "gc_csrf=create-token";
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { allVolunteersResponses: [Response.json([])] }),
    );
    await screen.findByText("Noch keine Helfer vorhanden.");
    fireEvent.click(screen.getByRole("button", { name: "Neuer Helfer" }));
    const form = screen.getByRole("button", { name: "Helfer erstellen" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: " " } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vorname, Nachname, Telefon und E-Mail sind erforderlich.",
    );

    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Zeta" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "079 111 11 11" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), {
      target: { value: "anna@example.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Helfer erstellen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/families\/volunteers$/),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-CSRF-Token": "create-token" }),
        }),
      ),
    );
    expect(await screen.findByText("Helfer wurde erstellt.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Anna Zeta" })).toBeInTheDocument();
  });

  it("shows the family drill-down for a linked volunteer with team_name on children", async () => {
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        allVolunteersResponses: [Response.json([directoryVolunteer])],
        volunteerFamilyResponses: [
          Response.json({
            family_id: "family-1",
            family_display_name: "Familie Muster",
            family_internal_note: null,
            members: [
              {
                id: "member-child",
                member_type: "CHILD",
                first_name: "Lina",
                last_name: "Zeta",
                team_name: "U12",
                volunteer_id: null,
                volunteer_first_name: null,
                volunteer_last_name: null,
              },
              {
                id: "member-1",
                member_type: "HELPER",
                first_name: "Anna",
                last_name: "Zeta",
                team_name: null,
                volunteer_id: "volunteer-1",
                volunteer_first_name: "Anna",
                volunteer_last_name: "Zeta",
              },
            ],
          }),
        ],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    expect(await screen.findByText("Familie: Familie Muster")).toBeInTheDocument();
    expect(screen.getByText(/Lina Zeta.*U12/)).toBeInTheDocument();
  });

  it("jumps to the Familien tab when a family badge is activated", async () => {
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        allVolunteersResponses: [Response.json([directoryVolunteer])],
        familyResponses: [Response.json([family])],
        volunteerFamilyResponses: [
          Response.json({
            family_id: "family-1",
            family_display_name: "Familie Muster",
            family_internal_note: null,
            members: [],
          }),
        ],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    fireEvent.click(await screen.findByText("Familie: Familie Muster"));
    expect(await screen.findByRole("heading", { name: "Familie Muster" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Familien" })).toHaveAttribute("aria-selected", "true");
  });

  it("offers linking to an existing family or creating a new one when unlinked", async () => {
    document.cookie = "gc_csrf=link-token";
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        allVolunteersResponses: [
          Response.json([{ ...directoryVolunteer, family_display_name: null }]),
        ],
        familyResponses: [Response.json([family])],
        volunteerFamilyResponses: [Response.json(null), Response.json(null)],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    expect(await screen.findByText("Noch nicht mit einer Familie verknüpft.")).toBeInTheDocument();
    const select = await screen.findByLabelText("Bestehende Familie");
    fireEvent.change(select, { target: { value: "family-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/families\/family-1\/members$/),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-CSRF-Token": "link-token" }),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/families\/family-1\/members\/member-1\/volunteer$/),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("shows an account hint instead of password actions when unlinked to a login account", async () => {
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        allVolunteersResponses: [Response.json([{ ...directoryVolunteer, has_account: false }])],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    expect(await screen.findByText(/hat noch kein eigenes Helferkonto/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset-Link senden" })).not.toBeInTheDocument();
  });

  it("sends a password-reset link and directly sets a new password for an account holder", async () => {
    document.cookie = "gc_csrf=password-token";
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { allVolunteersResponses: [Response.json([directoryVolunteer])] }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset-Link senden" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/volunteers\/volunteer-1\/send-password-reset$/),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-CSRF-Token": "password-token" }),
        }),
      ),
    );
    expect(
      await screen.findByText("Der Link zum Zurücksetzen des Passworts wurde gesendet."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Passwort direkt setzen" }));
    const passwordInput = await screen.findByLabelText("Neues Passwort");
    expect(passwordInput).toHaveAttribute("minlength", "10");
    fireEvent.change(passwordInput, { target: { value: "ein-neues-langes-passwort" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort setzen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/volunteers\/volunteer-1\/set-password$/),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-CSRF-Token": "password-token" }),
          body: JSON.stringify({ new_password: "ein-neues-langes-passwort" }),
        }),
      ),
    );
    expect(await screen.findByText("Das neue Passwort wurde gesetzt.")).toBeInTheDocument();
  });

  it("deletes a volunteer after confirmation and removes it from the list", async () => {
    document.cookie = "gc_csrf=delete-token";
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { allVolunteersResponses: [Response.json([directoryVolunteer])] }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Helfer endgültig löschen" }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Anna Zeta/));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/volunteers\/volunteer-1$/),
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({ "X-CSRF-Token": "delete-token" }),
        }),
      ),
    );
    expect(await screen.findByText("Helfer wurde gelöscht.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anna Zeta" })).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is dismissed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { allVolunteersResponses: [Response.json([directoryVolunteer])] }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Helfer endgültig löschen" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Anna Zeta" })).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("shows a clear error and keeps the volunteer when deletion is blocked by existing records", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        allVolunteersResponses: [Response.json([directoryVolunteer])],
        deleteVolunteerResponse: Response.json(
          { detail: "volunteer has signups or work records and cannot be deleted" },
          { status: 409 },
        ),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Anna Zeta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Helfer endgültig löschen" }));
    expect(
      await screen.findByText(
        "Der Helfer hat Anmeldungen oder Arbeitszeiten und kann nicht gelöscht werden.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anna Zeta" })).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("supports query selection, mobile back, and browser back for the selected volunteer", async () => {
    window.history.replaceState({}, "", "/example/admin/families?volunteer=volunteer-1");
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { allVolunteersResponses: [Response.json([directoryVolunteer])] }),
    );
    expect(await screen.findByRole("heading", { name: "Anna Zeta" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zurück zu Helfern" }));
    expect(window.location.search).not.toContain("volunteer=volunteer-1");
    fireEvent.click(screen.getByRole("button", { name: "Anna Zeta" }));
    expect(window.location.search).toContain("volunteer=volunteer-1");
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByLabelText("Helferliste")).toBeInTheDocument();
  });

  it.each(["ADMIN", "KOORDINATION"] as const)("is visible and accessible for %s", async (role) => {
    renderAdmin(role, adminFetch(role, { allVolunteersResponses: [Response.json([])] }));
    expect(await screen.findByRole("heading", { name: "Helfer" })).toBeInTheDocument();
  });

  it.each(["KIOSK", "VORSTAND_LESEN"] as const)("is hidden for %s", async (role) => {
    const fetchMock = renderAdmin(role);
    expect(await screen.findByText(/keine Berechtigung/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Helfer" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/families/all-volunteers")),
    ).toBe(false);
  });
});

describe("family (Familien) admin — secondary view", () => {
  it("switches tabs, shows the family list, and keeps counts without exposing contact data", async () => {
    renderAdmin("ADMIN", adminFetch("ADMIN", { familyResponses: [Response.json([family])] }));
    await openFamilienTab();
    await screen.findByRole("heading", { name: "Familien" });
    const row = (await screen.findByRole("button", { name: "Familie Muster" })).closest("tr")!;
    expect(row).toHaveTextContent("Familie Muster11");
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("+41 79 000 00 00")).not.toBeInTheDocument();
  });

  it("searches case-insensitively, clears, and distinguishes no results", async () => {
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        familyResponses: [
          Response.json([family, { ...family, id: "family-2", display_name: "Familie Keller" }]),
        ],
      }),
    );
    await openFamilienTab();
    await screen.findByRole("button", { name: "Familie Muster" });
    fireEvent.change(screen.getByLabelText("Familien suchen"), { target: { value: "kELLER" } });
    expect(screen.queryByRole("button", { name: "Familie Muster" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Familie Keller" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Familien suchen"), { target: { value: "Niemand" } });
    expect(screen.getByText("Keine Familien für diese Suche gefunden.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suche löschen" }));
    expect(screen.getByRole("button", { name: "Familie Muster" })).toBeInTheDocument();
  });

  it("supports query selection, mobile back, browser back, and cached selected-only loading", async () => {
    window.history.replaceState({}, "", "/example/admin/families?tab=familien&family=family-1");
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { familyResponses: [Response.json([family])] }),
    );
    expect(await screen.findByRole("heading", { name: "Familie Muster" })).toBeInTheDocument();
    await screen.findByText("Noch keine Familienmitglieder vorhanden.");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/members"))).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zurück zu Familien" }));
    expect(window.location.search).not.toContain("family=family-1");
    fireEvent.click(screen.getByRole("button", { name: "Familie Muster" }));
    expect(window.location.search).toContain("family=family-1");
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/members"))).toHaveLength(
        1,
      ),
    );
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByLabelText("Familienliste")).toBeInTheDocument();
  });

  it("renders children and helpers as visible semantic badge variants", async () => {
    const child = { ...member, id: "member-child", member_type: "CHILD", first_name: "Lina" };
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", {
        familyResponses: [Response.json([family])],
        memberResponses: [Response.json([child, member])],
        familyVolunteersResponses: [
          Response.json([{ id: "volunteer-1", first_name: "Anna", last_name: "Zeta" }]),
        ],
      }),
    );
    await openFamilienTab();
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));

    expect(await screen.findByText("Lina Andere")).toBeInTheDocument();
    expect(screen.getByText("Kind", { selector: "span" })).toHaveClass("bg-status-neutral/10");
    expect(screen.getByText("Helfer", { selector: "span" })).toHaveClass(
      "bg-primary/10",
      "text-primary",
    );
    expect(await screen.findByLabelText("Volunteer für Mia Andere")).toBeInTheDocument();
  });

  it.each(["ADMIN", "KOORDINATION"] as const)("is visible and accessible for %s", async (role) => {
    renderAdmin(role);
    await openFamilienTab();
    expect(await screen.findByRole("heading", { name: "Familien" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Neue Familie" }));
    expect(screen.getByLabelText("Familienname")).toHaveAttribute("required");
    expect(screen.getByLabelText("Familienname")).toHaveAttribute("maxlength", "160");
    expect(screen.getByLabelText("Interne Notiz (optional)")).toBeInTheDocument();
  });

  it("creates a trimmed family with CSRF and refreshes the list", async () => {
    document.cookie = "gc_csrf=family-token";
    const fetchMock = renderAdmin(
      "KOORDINATION",
      adminFetch("KOORDINATION", {
        familyResponses: [Response.json([]), Response.json([family])],
      }),
    );
    await openFamilienTab();
    await screen.findByText("Noch keine Familien vorhanden.");
    fireEvent.click(screen.getByRole("button", { name: "Neue Familie" }));
    fireEvent.change(screen.getByLabelText("Familienname"), {
      target: { value: "  Familie Muster  " },
    });
    fireEvent.change(screen.getByLabelText("Interne Notiz (optional)"), {
      target: { value: "Nur intern" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Familie erstellen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/admin\/example\/families$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({ "X-CSRF-Token": "family-token" }),
          body: JSON.stringify({ display_name: "Familie Muster", internal_note: "Nur intern" }),
        }),
      ),
    );
    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent(
      "Familie wurde erstellt.",
    );
    expect(await screen.findByRole("heading", { name: "Familie Muster" })).toBeInTheDocument();
    expect(screen.getByText("Nur intern")).toBeInTheDocument();
  });

  it("rejects whitespace-only family names before calling the API", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await openFamilienTab();
    await screen.findByText("Noch keine Familien vorhanden.");
    fireEvent.click(screen.getByRole("button", { name: "Neue Familie" }));
    const form = screen.getByRole("button", { name: "Familie erstellen" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("Familienname"), { target: { value: "   " } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Familienname ist erforderlich.",
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith("/families") && init?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("shows member type labels, a Mannschaft field for children only, and an empty state", async () => {
    renderAdmin("ADMIN", adminFetch("ADMIN", { familyResponses: [Response.json([family])] }));
    await openFamilienTab();
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    expect(await screen.findByText("Noch keine Familienmitglieder vorhanden.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mitgliedstyp")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kind" })).toHaveValue("CHILD");
    expect(screen.getByRole("option", { name: "Helfer" })).toHaveValue("HELPER");
    expect(screen.getByLabelText("Vorname")).toHaveAttribute("maxlength", "100");
    expect(screen.getByLabelText("Nachname")).toHaveAttribute("maxlength", "100");
    expect(screen.getByLabelText("Mannschaft (optional)")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mitgliedstyp"), { target: { value: "HELPER" } });
    expect(screen.queryByLabelText("Mannschaft (optional)")).not.toBeInTheDocument();
  });

  it("creates a child with a team_name and a helper without one", async () => {
    document.cookie = "gc_csrf=member-token";
    const child = { ...member, id: "member-child", member_type: "CHILD", team_name: "U12" };
    const fetchMock = renderAdmin(
      "KOORDINATION",
      adminFetch("KOORDINATION", {
        familyResponses: [Response.json([family])],
        memberResponses: [Response.json([]), Response.json([child])],
      }),
    );
    await openFamilienTab();
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    await screen.findByText("Noch keine Familienmitglieder vorhanden.");
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Andere" } });
    fireEvent.change(screen.getByLabelText("Mannschaft (optional)"), {
      target: { value: "U12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mitglied erstellen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/admin\/example\/families\/family-1\/members$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({ "X-CSRF-Token": "member-token" }),
          body: JSON.stringify({
            member_type: "CHILD",
            first_name: "Mia",
            last_name: "Andere",
            team_name: "U12",
          }),
        }),
      ),
    );
    expect(await screen.findByText(/Mia Andere.*U12/)).toBeInTheDocument();
  });

  it("creates a trimmed helper without a team_name field in the payload", async () => {
    document.cookie = "gc_csrf=member-token";
    const fetchMock = renderAdmin(
      "KOORDINATION",
      adminFetch("KOORDINATION", {
        familyResponses: [Response.json([family])],
        memberResponses: [Response.json([]), Response.json([member])],
      }),
    );
    await openFamilienTab();
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    await screen.findByText("Noch keine Familienmitglieder vorhanden.");
    fireEvent.change(screen.getByLabelText("Mitgliedstyp"), { target: { value: "HELPER" } });
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: " Mia " } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: " Andere " } });
    fireEvent.click(screen.getByRole("button", { name: "Mitglied erstellen" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/admin\/example\/families\/family-1\/members$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({ "X-CSRF-Token": "member-token" }),
          body: JSON.stringify({
            member_type: "HELPER",
            first_name: "Mia",
            last_name: "Andere",
          }),
        }),
      ),
    );
    expect(await screen.findByText("Mia Andere")).toBeInTheDocument();
    expect(screen.getByText("Helfer", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Familienmitglied wurde erstellt.");
  });

  it("rejects whitespace-only member names before calling the API", async () => {
    const fetchMock = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", { familyResponses: [Response.json([family])] }),
    );
    await openFamilienTab();
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    await screen.findByText("Noch keine Familienmitglieder vorhanden.");
    const form = screen.getByRole("button", { name: "Mitglied erstellen" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vorname und Nachname sind erforderlich.",
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith("/members") && init?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("searches active volunteers by name and links, replaces, and removes with refresh", async () => {
    document.cookie = "gc_csrf=link-token";
    const first = {
      id: "volunteer-1",
      first_name: "Anna",
      last_name: "Zeta",
      phone: "079 111 11 11",
      email: "anna@example.invalid",
      compensation_preference: "WORK_HOURS",
      compensation_family_member_id: null,
      internal_note: null,
      status: "ACTIVE",
    };
    const second = {
      id: "volunteer-2",
      first_name: "Berta",
      last_name: "Alpha",
      phone: "079 222 22 22",
      email: "berta@example.invalid",
      compensation_preference: "VOLUNTARY",
      compensation_family_member_id: null,
      internal_note: null,
      status: "ACTIVE",
    };
    const fetchMock = adminFetch("ADMIN", {
      familyResponses: [Response.json([family])],
      memberResponses: [
        Response.json([member]),
        Response.json([{ ...member, volunteer_id: first.id }]),
        Response.json([{ ...member, volunteer_id: second.id }]),
        Response.json([member]),
      ],
      familyVolunteersResponses: [Response.json([second, first])],
    });
    renderAdmin("ADMIN", fetchMock);
    await openFamilienTab();
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));

    const search = await screen.findByLabelText("Volunteer suchen");
    const picker = screen.getByLabelText("Volunteer für Mia Andere");
    expect(picker).toHaveValue("");
    expect(screen.getByText("Noch nicht mit einem Volunteer verknüpft")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "berta" } });
    expect(screen.queryByRole("option", { name: "Anna Zeta" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Berta Alpha" })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });

    fireEvent.change(picker, { target: { value: first.id } });
    expect(await screen.findByRole("status")).toHaveTextContent("Volunteer wurde verknüpft.");
    expect(await screen.findByText("079 111 11 11 · anna@example.invalid")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Volunteer für Mia Andere"), {
      target: { value: second.id },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Volunteer-Verknüpfung wurde ersetzt.",
    );
    expect(await screen.findByText("079 222 22 22 · berta@example.invalid")).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const linkedPicker = screen.getByLabelText("Volunteer für Mia Andere");
    fireEvent.change(linkedPicker, { target: { value: "" } });
    const patchesBefore = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).endsWith("/member-1/volunteer") && init?.method === "PATCH",
    ).length;
    expect(patchesBefore).toBe(2);
    fireEvent.change(linkedPicker, { target: { value: "" } });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Volunteer-Verknüpfung wurde entfernt.",
    );
    expect(await screen.findByText("Noch nicht mit einem Volunteer verknüpft")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith("/member-1/volunteer") && init?.method === "PATCH",
      ),
    ).toHaveLength(3);
  });

  it("keeps a linked inactive volunteer visible, edits its email, and allows reactivation", async () => {
    document.cookie = "gc_csrf=reactivate-token";
    const inactive = {
      id: "volunteer-inactive",
      first_name: "Anna",
      last_name: "Zeta",
      phone: "079 111 11 11",
      email: "anna@example.invalid",
      compensation_preference: "WORK_HOURS",
      compensation_family_member_id: null,
      internal_note: "Inaktiv geprüft",
      status: "INACTIVE",
    };
    const fetchMock = adminFetch("ADMIN", {
      familyResponses: [Response.json([family])],
      memberResponses: [Response.json([{ ...member, volunteer_id: inactive.id }])],
      familyVolunteersResponses: [Response.json([inactive])],
    });
    renderAdmin("ADMIN", fetchMock);
    await openFamilienTab();
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));

    expect(await screen.findByText("Inaktiv", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("E-Mail")).toHaveValue("anna@example.invalid");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ACTIVE" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(screen.queryByText("Inaktiv", { selector: "span" })).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/families\/volunteers\/volunteer-inactive$/),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "reactivate-token" }),
        body: expect.stringContaining('"status":"ACTIVE"'),
      }),
    );
  });
});
