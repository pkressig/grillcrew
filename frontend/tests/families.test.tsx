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

function adminFetch(role: StaffRole, familyResponses: Response[] = [Response.json([])]) {
  let familyIndex = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "csrf-memory" });
    if (url.endsWith("/families") && method === "GET")
      return familyResponses[Math.min(familyIndex++, familyResponses.length - 1)]!;
    if (url.endsWith("/families") && method === "POST")
      return Response.json(family, { status: 201 });
    if (url.endsWith("/club-years") || url.endsWith("/seasons")) return Response.json([]);
    if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
    return new Response(null, { status: 404 });
  });
}

function renderAdmin(role: StaffRole, fetchMock = adminFetch(role)) {
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
  clearCsrfToken();
});

describe("family admin", () => {
  it.each(["ADMIN", "KOORDINATION"] as const)("is visible and accessible for %s", async (role) => {
    renderAdmin(role);
    expect(await screen.findByRole("heading", { name: "Familien" })).toBeInTheDocument();
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

  it("rejects whitespace-only names before calling the API", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await screen.findByText("Noch keine Familien vorhanden.");
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
    fireEvent.change(screen.getByLabelText("Familienname"), { target: { value: "Muster" } });
    fireEvent.click(screen.getByRole("button", { name: "Familie erstellen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Familie konnte nicht erstellt werden.",
    );
    expect(loadingError).toHaveBeenCalled();
  });
});
