import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/app/[org]/admin/admin-shell";
import { AuthProvider } from "@/components/auth-provider";
import { OrganizationProvider } from "@/components/organization-provider";
import { clearCsrfToken } from "@/lib/api";
import type { AuthSession, StaffRole } from "@/lib/auth";
import { platformFallbackOrganization } from "@/lib/organization";

const { routerReplaceMock } = vi.hoisted(() => ({ routerReplaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplaceMock }) }));

const organizationSettings = {
  id: "settings-1",
  organization_id: "org-1",
  payout_rate_minor_per_hour: 900,
  signup_rate_limit_per_contact: 5,
  signup_rate_limit_window_minutes: 60,
  coordination_contact_label: "Grillkoordination",
  coordination_contact_phone: "079 513 44 33",
  created_at: "2026-07-30T10:00:00Z",
  updated_at: "2026-07-30T10:00:00Z",
};

const homeVenue = {
  id: "venue-1",
  organization_id: "org-1",
  name: "Cazis / St. Martin",
  name_normalized: "cazis / st. martin",
  is_active: true,
  created_at: "2026-07-30T10:00:00Z",
  updated_at: "2026-07-30T10:00:00Z",
};

const namedRule = {
  id: "rule-1",
  organization_id: "org-1",
  sort_order: 0,
  pattern: "Junioren",
  menu_type: "FRIES_NUGGETS",
  required_griller_count: 1,
  min_games_per_shift: 1,
  is_active: true,
  created_at: "2026-07-30T10:00:00Z",
  updated_at: "2026-07-30T10:00:00Z",
};

const catchallRule = {
  ...namedRule,
  id: "rule-catchall",
  pattern: null,
  required_griller_count: 2,
};

const theme = {
  id: "theme-1",
  name: "Example Org",
  logo_url: null,
  banner_url: null,
  primary_color: "#262626",
  secondary_color: "#525252",
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

function settingsFetch(role: StaffRole, identityResponse?: { status: number; body: unknown }) {
  const rules = [namedRule, catchallRule];
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) return Response.json(session(role));
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "csrf-memory" });
    if (url.endsWith("/settings/organization") && method === "PATCH") {
      if (identityResponse)
        return Response.json(identityResponse.body, { status: identityResponse.status });
      const { slug } = JSON.parse(String(init?.body)) as { slug: string };
      return Response.json({ id: "org-1", name: "Example Org", short_name: null, slug });
    }
    if (url.endsWith("/coordination-time-records") && method === "GET") return Response.json([]);
    if (url.endsWith("/coordination-time-records") && method === "POST")
      return Response.json(
        {
          id: "coord-1",
          payout_amount_minor: 1500,
          payout_status: "OPEN",
          signature_received_at: null,
          signature_received_by_user_id: null,
          signature_note: null,
          created_at: "2026-08-01T10:00:00Z",
          updated_at: "2026-08-01T10:00:00Z",
          ...JSON.parse(String(init?.body)),
        },
        { status: 201 },
      );
    if (url.endsWith("/settings/organization-settings") && method === "GET")
      return Response.json(organizationSettings);
    if (url.endsWith("/settings/organization-settings") && method === "PATCH")
      return Response.json({ ...organizationSettings, ...JSON.parse(String(init?.body)) });
    if (url.endsWith("/settings/theme") && method === "GET") return Response.json(theme);
    if (url.endsWith("/settings/theme") && method === "PATCH")
      return Response.json({ ...theme, ...JSON.parse(String(init?.body)) });
    if (url.endsWith("/settings/home-venues") && method === "GET")
      return Response.json([homeVenue]);
    if (url.endsWith("/settings/home-venues") && method === "POST")
      return Response.json(
        { ...homeVenue, id: "venue-2", ...JSON.parse(String(init?.body)) },
        { status: 201 },
      );
    if (url.endsWith("/settings/home-venues/venue-1") && method === "PATCH")
      return Response.json({ ...homeVenue, ...JSON.parse(String(init?.body)) });
    if (url.endsWith("/settings/crew-size-rules") && method === "GET") return Response.json(rules);
    if (url.endsWith("/settings/crew-size-rules") && method === "POST")
      return Response.json(
        { ...namedRule, id: "rule-2", sort_order: 1, ...JSON.parse(String(init?.body)) },
        { status: 201 },
      );
    if (url.endsWith("/settings/crew-size-rules/rule-1") && method === "PATCH")
      return Response.json({ ...namedRule, ...JSON.parse(String(init?.body)) });
    if (url.endsWith("/settings/crew-size-rules/reorder") && method === "POST")
      return Response.json(rules);
    return new Response(null, { status: 404 });
  });
}

const exampleOrganization = {
  ...platformFallbackOrganization,
  name: "Example Org",
  slug: "example",
};

function renderAdmin(
  role: StaffRole,
  activeView: "settings" | "families" = "settings",
  identityResponse?: { status: number; body: unknown },
) {
  const fetchMock = settingsFetch(role, identityResponse);
  vi.stubGlobal("fetch", fetchMock);
  render(
    <AuthProvider>
      <OrganizationProvider organization={exampleOrganization}>
        <AdminShell activeView={activeView} org="example" organization={exampleOrganization} />
      </OrganizationProvider>
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

describe("settings admin navigation and role gating", () => {
  it("shows the Einstellungen nav link only for ADMIN", async () => {
    renderAdmin("ADMIN");
    await screen.findByRole("heading", { name: "Einstellungen" });
    expect(screen.getAllByRole("link", { name: "Einstellungen" })[0]).toHaveAttribute(
      "href",
      "/example/admin/settings",
    );
  });

  it("hides the Einstellungen nav link for KOORDINATION", async () => {
    renderAdmin("KOORDINATION", "families");
    await screen.findByRole("heading", { name: "Helfer" });
    expect(screen.queryByRole("link", { name: "Einstellungen" })).not.toBeInTheDocument();
  });

  it("denies KOORDINATION direct access to the settings view", async () => {
    renderAdmin("KOORDINATION");
    expect(await screen.findByText("keine Berechtigung")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Einstellungen" })).not.toBeInTheDocument();
  });
});

describe("organization identity (URL slug)", () => {
  it("renders the club name and current slug", async () => {
    renderAdmin("ADMIN");
    const slugInput = await screen.findByLabelText("URL-Kürzel");
    expect(slugInput).toHaveValue("example");
    const form = slugInput.closest("form");
    if (!form) throw new Error("organization identity form not found");
    expect(within(form).getByText("Example Org")).toBeInTheDocument();
  });

  it("asks for confirmation before submitting and does not save when cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = renderAdmin("ADMIN");
    const slugInput = await screen.findByLabelText("URL-Kürzel");
    fireEvent.change(slugInput, { target: { value: "newslug" } });
    const form = slugInput.closest("form");
    if (!form) throw new Error("organization identity form not found");
    fireEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/settings/organization") &&
          (init as RequestInit | undefined)?.method === "PATCH",
      ),
    ).toBe(false);
    expect(routerReplaceMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("confirms, saves the new slug, and redirects to the renamed settings URL", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = renderAdmin("ADMIN");
    const slugInput = await screen.findByLabelText("URL-Kürzel");
    fireEvent.change(slugInput, { target: { value: "newslug" } });
    const form = slugInput.closest("form");
    if (!form) throw new Error("organization identity form not found");
    fireEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/settings/organization") &&
            (init as RequestInit | undefined)?.method === "PATCH" &&
            JSON.parse(String((init as RequestInit).body)).slug === "newslug",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText("URL-Kürzel geändert, du wirst weitergeleitet …"),
    ).toBeInTheDocument();
    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith("/newslug/admin/settings"));
    confirmSpy.mockRestore();
  });

  it("shows the backend error on a 409 conflict without navigating away", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAdmin("ADMIN", "settings", {
      status: 409,
      body: { detail: "Dieses URL-Kürzel ist bereits vergeben." },
    });
    const slugInput = await screen.findByLabelText("URL-Kürzel");
    fireEvent.change(slugInput, { target: { value: "taken" } });
    const form = slugInput.closest("form");
    if (!form) throw new Error("organization identity form not found");
    fireEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Dieses URL-Kürzel ist bereits vergeben.")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("shows the backend error on a 422 invalid slug without navigating away", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAdmin("ADMIN", "settings", {
      status: 422,
      body: { detail: "Das URL-Kürzel ist ungültig." },
    });
    const slugInput = await screen.findByLabelText("URL-Kürzel");
    fireEvent.change(slugInput, { target: { value: "***" } });
    const form = slugInput.closest("form");
    if (!form) throw new Error("organization identity form not found");
    fireEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Das URL-Kürzel ist ungültig.")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("organization settings form", () => {
  it("loads and saves organization settings", async () => {
    const fetchMock = renderAdmin("ADMIN");
    const rateInput = await screen.findByLabelText("Auszahlungssatz (Rappen/Stunde)");
    expect(rateInput).toHaveValue(900);
    const phoneInput = screen.getByLabelText(/Koordinationskontakt \(Telefon\)/);
    expect(phoneInput).toHaveValue("079 513 44 33");
    fireEvent.change(rateInput, { target: { value: "950" } });
    const form = rateInput.closest("form");
    if (!form) throw new Error("organization settings form not found");
    fireEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/settings/organization-settings") &&
            (init as RequestInit | undefined)?.method === "PATCH" &&
            JSON.parse(String((init as RequestInit).body)).coordination_contact_phone ===
              "079 513 44 33",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText("Organisationseinstellungen wurden gespeichert."),
    ).toBeInTheDocument();
  });
});

describe("theme (branding)", () => {
  it("loads and saves the theme form", async () => {
    const fetchMock = renderAdmin("ADMIN");
    const logoInput = await screen.findByLabelText("Logo-URL");
    expect(logoInput).toHaveValue("");
    fireEvent.change(logoInput, { target: { value: "https://example.test/logo.png" } });
    const form = logoInput.closest("form");
    if (!form) throw new Error("theme form not found");
    fireEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/settings/theme") &&
            (init as RequestInit | undefined)?.method === "PATCH",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Erscheinungsbild wurde gespeichert.")).toBeInTheDocument();
  });
});

describe("coordination time", () => {
  it("shows an honest empty state and creates a separate ADMIN record", async () => {
    const fetchMock = renderAdmin("ADMIN");
    expect(await screen.findByText("Noch keine Koordinationszeiten erfasst.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Dauer (Minuten)"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Eigener Stundensatz (Rappen)"), {
      target: { value: "900" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Koordinationszeit erfassen" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/coordination-time-records") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });
});

describe("home venues", () => {
  it("lists venues and creates a new one", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await screen.findByText("Cazis / St. Martin");
    fireEvent.change(screen.getByLabelText("Neuer Heimplatz"), {
      target: { value: "Thusis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/settings/home-venues") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("confirms before deactivating an active venue", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = renderAdmin("ADMIN");
    const venueList = await screen.findByRole("list", { name: "Heimplätze" });
    fireEvent.click(within(venueList).getByRole("button", { name: "Deaktivieren" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/settings/home-venues/venue-1") &&
          (init as RequestInit | undefined)?.method === "PATCH",
      ),
    ).toBe(false);
    confirmSpy.mockRestore();
  });
});

describe("crew-size rules", () => {
  it("renders the default rule as visually distinct and last", async () => {
    renderAdmin("ADMIN");
    const list = await screen.findByRole("list", { name: "Crew-Regeln" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[1]!).getByText("Standardregel (alle übrigen Spiele)")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Muster: Junioren")).toBeInTheDocument();
  });

  it("does not offer reorder or deactivate controls on the default rule", async () => {
    renderAdmin("ADMIN");
    const list = await screen.findByRole("list", { name: "Crew-Regeln" });
    const items = within(list).getAllByRole("listitem");
    const catchallItem = items[1]!;
    expect(
      within(catchallItem).queryByRole("button", { name: "Regel nach oben verschieben" }),
    ).not.toBeInTheDocument();
    expect(
      within(catchallItem).queryByRole("button", { name: "Deaktivieren" }),
    ).not.toBeInTheDocument();
  });

  it("creates a new crew-size rule", async () => {
    const fetchMock = renderAdmin("ADMIN");
    await screen.findByText("Muster: Junioren");
    fireEvent.change(screen.getByLabelText('Team-Muster (z. B. "Junioren")'), {
      target: { value: "Herren" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Regel hinzufügen" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/settings/crew-size-rules") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });
});
