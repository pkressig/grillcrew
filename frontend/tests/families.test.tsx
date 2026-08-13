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

function adminFetch(
  role: StaffRole,
  familyResponses: Response[] = [Response.json([])],
  memberResponses: Response[] = [Response.json([])],
  volunteerResponses: Response[] = [Response.json([])],
) {
  let familyIndex = 0;
  let memberIndex = 0;
  let volunteerIndex = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "csrf-memory" });
    if (url.endsWith("/families/volunteers") && method === "GET")
      return volunteerResponses[Math.min(volunteerIndex++, volunteerResponses.length - 1)]!;
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
    if (url.includes("/families/volunteers/") && method === "PATCH") {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        id: url.split("/").at(-1),
        email: "anna@example.invalid",
        ...payload,
      });
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.cookie = "gc_csrf=; Max-Age=0";
  clearCsrfToken();
  window.history.replaceState({}, "", "/");
});

describe("family admin", () => {
  it("provides responsive navigation, active state, skip link, and family-scoped counts", async () => {
    const fetchMock = renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([family])]));
    await screen.findByRole("heading", { name: "Familien" });
    expect(screen.getByText("Zum Inhalt")).toHaveAttribute("href", "#admin-content");
    expect(screen.getAllByRole("link", { name: "Familien" })[0]).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("link", { name: "Anwesenheit" })[0]).toHaveAttribute(
      "href",
      "/example/admin/attendance",
    );
    expect(document.querySelector("aside")).toHaveClass("lg:sticky");
    expect(document.querySelector("aside")).toHaveClass("bg-foreground", "text-background");
    expect(document.querySelector("header nav ul")).toHaveClass("flex", "flex-wrap");
    const desktopFamilyLink = screen.getAllByRole("link", { name: "Familien" })[0]!;
    expect(desktopFamilyLink).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
      "focus-visible:ring-2",
    );
    expect(desktopFamilyLink.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByText("Volunteer Platform", { selector: "p" })[0]).toHaveClass(
      "truncate",
      "opacity-70",
    );
    expect(screen.getAllByText("Rolle: Administration")[0]).toHaveClass("text-xs", "opacity-70");
    expect(
      fetchMock.mock.calls.some(([url]) => /club-years|seasons|events|shifts/.test(String(url))),
    ).toBe(false);
    expect(await screen.findByRole("columnheader", { name: "Kinder" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/families"))).toHaveLength(
      1,
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/members"))).toBe(false);
    expect(screen.getByRole("columnheader", { name: "Helfer" })).toBeInTheDocument();
  });

  it("searches case-insensitively, clears, and distinguishes no results", async () => {
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", [
        Response.json([family, { ...family, id: "family-2", display_name: "Familie Keller" }]),
      ]),
    );
    await screen.findByRole("button", { name: "Familie Muster" });
    fireEvent.change(screen.getByLabelText("Familien suchen"), { target: { value: "kELLER" } });
    expect(screen.queryByRole("button", { name: "Familie Muster" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Familie Keller" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Familien suchen"), { target: { value: "Niemand" } });
    expect(screen.getByText("Keine Familien für diese Suche gefunden.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suche löschen" }));
    expect(screen.getByRole("button", { name: "Familie Muster" })).toBeInTheDocument();
  });

  it("shows real child and helper counts without exposing contact data", async () => {
    renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([family])]));

    const row = (await screen.findByRole("button", { name: "Familie Muster" })).closest("tr")!;
    expect(row).toHaveTextContent("Familie Muster11");
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("+41 79 000 00 00")).not.toBeInTheDocument();
  });

  it("supports query selection, mobile back, browser back, and cached selected-only loading", async () => {
    window.history.replaceState({}, "", "/example/admin/families?family=family-1");
    const fetchMock = renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([family])]));
    expect(await screen.findByRole("heading", { name: "Familie Muster" })).toBeInTheDocument();
    await screen.findByText("Noch keine Familienmitglieder vorhanden.");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/members"))).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zurück zu Familien" }));
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Familie Muster" }));
    expect(window.location.search).toBe("?family=family-1");
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/members"))).toHaveLength(
        1,
      ),
    );
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByLabelText("Familienliste")).toBeInTheDocument();
  });

  it("uses table hierarchy, focus treatment, and a distinct selected family state", async () => {
    renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([family])]));
    const familyButton = await screen.findByRole("button", { name: "Familie Muster" });
    expect(screen.getByLabelText("Familienliste").querySelector(".shadow-card")).not.toBeNull();
    expect(screen.getByLabelText("Familiendetails").querySelector(".shadow-card")).not.toBeNull();
    expect(familyButton).toHaveClass("focus-visible:ring-2", "focus-visible:ring-primary");

    familyButton.focus();
    expect(familyButton).toHaveFocus();
    fireEvent.click(familyButton);

    expect(familyButton).toHaveAttribute("aria-current", "true");
    expect(familyButton.closest("tr")).toHaveClass("bg-primary/5");
  });

  it("renders children and helpers as visible semantic badge variants", async () => {
    const child = {
      ...member,
      id: "member-child",
      member_type: "CHILD",
      first_name: "Lina",
    };
    renderAdmin(
      "ADMIN",
      adminFetch(
        "ADMIN",
        [Response.json([family])],
        [Response.json([child, member])],
        [Response.json([{ id: "volunteer-1", first_name: "Anna", last_name: "Zeta" }])],
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));

    expect(await screen.findByText("Lina Andere")).toBeInTheDocument();
    expect(screen.getByText("Kind", { selector: "span" })).toHaveClass("bg-status-neutral/10");
    expect(screen.getByText("Helfer", { selector: "span" })).toHaveClass(
      "bg-primary/10",
      "text-primary",
    );
    expect(await screen.findByLabelText("Volunteer für Mia Andere")).toBeInTheDocument();
    expect(screen.queryByLabelText("Volunteer für Lina Andere")).not.toBeInTheDocument();
  });

  it("clears transient detail feedback when directly switching families", async () => {
    const secondFamily = { ...family, id: "family-2", display_name: "Familie Keller" };
    renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([family, secondFamily])]));

    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    await screen.findByText("Noch keine Familienmitglieder vorhanden.");
    const form = screen.getByRole("button", { name: "Mitglied erstellen" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vorname und Nachname sind erforderlich.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Familie Keller" }));
    expect(await screen.findByRole("heading", { name: "Familie Keller" })).toBeInTheDocument();
    expect(screen.queryByText("Vorname und Nachname sind erforderlich.")).not.toBeInTheDocument();
  });

  it.each(["ADMIN", "KOORDINATION"] as const)("is visible and accessible for %s", async (role) => {
    renderAdmin(role);
    expect(await screen.findByRole("heading", { name: "Familien" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Neue Familie" }));
    expect(screen.getByLabelText("Familienname")).toHaveAttribute("required");
    expect(screen.getByLabelText("Familienname")).toHaveAttribute("maxlength", "160");
    expect(screen.getByLabelText("Interne Notiz (optional)")).toBeInTheDocument();
  });

  it.each(["KIOSK", "VORSTAND_LESEN"] as const)("is hidden for %s", async (role) => {
    const fetchMock = renderAdmin(role);
    expect(await screen.findByText(/keine Berechtigung/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Familien" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/families"))).toBe(false);
  });

  it("shows loading and empty states", async () => {
    let resolveFamilies!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFamilies = resolve;
    });
    const base = adminFetch("ADMIN");
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/families") ? pending : base(input, init),
    );
    renderAdmin("ADMIN", fetchMock);
    expect(await screen.findByText("Familien werden geladen …")).toBeInTheDocument();
    resolveFamilies(Response.json([]));
    expect(await screen.findByText("Noch keine Familien vorhanden.")).toBeInTheDocument();
  });

  it("creates a trimmed family with CSRF and refreshes the list", async () => {
    document.cookie = "gc_csrf=family-token";
    const fetchMock = renderAdmin(
      "KOORDINATION",
      adminFetch("KOORDINATION", [Response.json([]), Response.json([family])]),
    );
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

  it("clears family-creation success when selecting a different family", async () => {
    const secondFamily = { ...family, id: "family-2", display_name: "Familie Keller" };
    renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([secondFamily])]));

    await screen.findByRole("button", { name: "Familie Keller" });
    fireEvent.click(screen.getByRole("button", { name: "Neue Familie" }));
    fireEvent.change(screen.getByLabelText("Familienname"), {
      target: { value: "Familie Muster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Familie erstellen" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Familie wurde erstellt.");
    expect(await screen.findByRole("heading", { name: "Familie Muster" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Familie Keller" }));
    expect(await screen.findByRole("heading", { name: "Familie Keller" })).toBeInTheDocument();
    expect(screen.queryByText("Familie wurde erstellt.")).not.toBeInTheDocument();
  });

  it("rejects whitespace-only names before calling the API", async () => {
    const fetchMock = renderAdmin("ADMIN");
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

  it("shows loading and creation API errors", async () => {
    const loadingError = renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", [new Response(null, { status: 500 })]),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Familien konnten nicht geladen werden.",
    );
    cleanup();

    const base = adminFetch("ADMIN");
    const createError = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/families") && init?.method === "POST")
        return new Response(null, { status: 500 });
      return base(input, init);
    });
    renderAdmin("ADMIN", createError);
    await screen.findByText("Noch keine Familien vorhanden.");
    fireEvent.click(screen.getByRole("button", { name: "Neue Familie" }));
    fireEvent.change(screen.getByLabelText("Familienname"), { target: { value: "Muster" } });
    fireEvent.click(screen.getByRole("button", { name: "Familie erstellen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Familie konnte nicht erstellt werden.",
    );
    expect(loadingError).toHaveBeenCalled();
  });

  it("shows member type labels, accessible fields, and an empty state", async () => {
    renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([family])]));
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    expect(await screen.findByText("Noch keine Familienmitglieder vorhanden.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mitgliedstyp")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kind" })).toHaveValue("CHILD");
    expect(screen.getByRole("option", { name: "Helfer" })).toHaveValue("HELPER");
    expect(screen.getByLabelText("Vorname")).toHaveAttribute("maxlength", "100");
    expect(screen.getByLabelText("Nachname")).toHaveAttribute("maxlength", "100");
    expect(screen.queryByLabelText(/Team|Mannschaft/)).not.toBeInTheDocument();
  });

  it("shows member loading state", async () => {
    let resolveMembers!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveMembers = resolve;
    });
    const base = adminFetch("ADMIN", [Response.json([family])]);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/families/family-1/members") ? pending : base(input, init),
    );
    renderAdmin("ADMIN", fetchMock);
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    expect(await screen.findByText("Familienmitglieder werden geladen …")).toBeInTheDocument();
    resolveMembers(Response.json([]));
    expect(await screen.findByText("Noch keine Familienmitglieder vorhanden.")).toBeInTheDocument();
  });

  it("creates a trimmed helper with CSRF and refreshes its family members", async () => {
    document.cookie = "gc_csrf=member-token";
    const fetchMock = renderAdmin(
      "KOORDINATION",
      adminFetch(
        "KOORDINATION",
        [Response.json([family])],
        [Response.json([]), Response.json([member])],
      ),
    );
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
    const fetchMock = renderAdmin("ADMIN", adminFetch("ADMIN", [Response.json([family])]));
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

  it("shows member loading and creation API errors", async () => {
    renderAdmin(
      "ADMIN",
      adminFetch("ADMIN", [Response.json([family])], [new Response(null, { status: 500 })]),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Familienmitglieder konnten nicht geladen werden.",
    );
    cleanup();

    const base = adminFetch("ADMIN", [Response.json([family])]);
    const createError = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/members") && init?.method === "POST")
        return new Response(null, { status: 500 });
      return base(input, init);
    });
    renderAdmin("ADMIN", createError);
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    await screen.findByText("Noch keine Familienmitglieder vorhanden.");
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.click(screen.getByRole("button", { name: "Mitglied erstellen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Das Familienmitglied konnte nicht erstellt werden.",
    );
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
    const fetchMock = adminFetch(
      "ADMIN",
      [Response.json([family])],
      [
        Response.json([member]),
        Response.json([{ ...member, volunteer_id: first.id }]),
        Response.json([{ ...member, volunteer_id: second.id }]),
        Response.json([member]),
      ],
      [Response.json([second, first])],
    );
    renderAdmin("ADMIN", fetchMock);
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
    fireEvent.change(search, { target: { value: "berta" } });
    expect(screen.getByRole("option", { name: "Anna Zeta" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Berta Alpha" })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });

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
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/members\/member-1\/volunteer$/),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "link-token" }),
        body: JSON.stringify({ volunteer_id: null }),
      }),
    );
  });

  it("shows volunteer loading, empty, and retryable error states only for helpers", async () => {
    let resolveVolunteers!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveVolunteers = resolve;
    });
    const base = adminFetch("ADMIN", [Response.json([family])], [Response.json([member])]);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/families/volunteers") ? pending : base(input, init),
    );
    renderAdmin("ADMIN", fetchMock);
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    expect(await screen.findByText("Volunteers werden geladen …")).toBeInTheDocument();
    resolveVolunteers(Response.json([]));
    expect(await screen.findByText("Keine aktiven Volunteers verfügbar.")).toBeInTheDocument();
    cleanup();

    renderAdmin(
      "ADMIN",
      adminFetch(
        "ADMIN",
        [Response.json([family])],
        [Response.json([member])],
        [new Response(null, { status: 500 }), Response.json([])],
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Volunteers konnten nicht geladen werden.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Keine aktiven Volunteers verfügbar.")).toBeInTheDocument();
  });

  it("shows a neutral loading state for a linked helper instead of a false inactive fallback", async () => {
    let resolveVolunteers!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveVolunteers = resolve;
    });
    const linkedMember = { ...member, volunteer_id: "volunteer-1" };
    const base = adminFetch("ADMIN", [Response.json([family])], [Response.json([linkedMember])]);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/families/volunteers") ? pending : base(input, init),
    );
    renderAdmin("ADMIN", fetchMock);
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));

    expect(await screen.findByText("Helferdaten werden geladen …")).toBeInTheDocument();
    expect(screen.queryByText("Verknüpft mit einem nicht mehr aktiven Volunteer")).toBeNull();

    resolveVolunteers(
      Response.json([
        {
          id: "volunteer-1",
          first_name: "Anna",
          last_name: "Zeta",
          phone: "079 111 11 11",
          email: "anna@example.invalid",
          compensation_preference: "WORK_HOURS",
          compensation_family_member_id: null,
          internal_note: null,
          status: "ACTIVE",
        },
      ]),
    );
    expect(await screen.findByText("079 111 11 11 · anna@example.invalid")).toBeInTheDocument();
    expect(screen.queryByText("Helferdaten werden geladen …")).toBeNull();
  });

  it("keeps a linked inactive volunteer visible and allows safe reactivation", async () => {
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
    const fetchMock = adminFetch(
      "ADMIN",
      [Response.json([family])],
      [Response.json([{ ...member, volunteer_id: inactive.id }])],
      [Response.json([inactive])],
    );
    renderAdmin("ADMIN", fetchMock);
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));

    expect(await screen.findByText("Inaktiv", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
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

  it("offers active volunteers and the current inactive link only", async () => {
    const currentInactive = {
      id: "volunteer-current-inactive",
      first_name: "Anna",
      last_name: "Zeta",
      status: "INACTIVE",
    };
    const otherInactive = {
      id: "volunteer-other-inactive",
      first_name: "Berta",
      last_name: "Alpha",
      status: "INACTIVE",
    };
    const active = {
      id: "volunteer-active",
      first_name: "Clara",
      last_name: "Beta",
      status: "ACTIVE",
    };
    renderAdmin(
      "ADMIN",
      adminFetch(
        "ADMIN",
        [Response.json([family])],
        [Response.json([{ ...member, volunteer_id: currentInactive.id }])],
        [Response.json([currentInactive, otherInactive, active])],
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Familie Muster" }));

    expect(await screen.findByRole("option", { name: "Anna Zeta" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Berta Alpha" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Clara Beta" })).toBeInTheDocument();
  });
});
