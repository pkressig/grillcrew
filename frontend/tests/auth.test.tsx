import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { LoginForm } from "@/app/login/login-form";
import { AdminShell } from "@/app/[org]/admin/admin-shell";
import { LogoutButton } from "@/components/logout-button";
import { ResetPasswordForm } from "@/app/reset-password/[token]/reset-password-form";
import { InvitationForm } from "@/app/invite/[token]/invitation-form";
import type { AuthSession } from "@/lib/auth";
import { clearCsrfToken } from "@/lib/api";
import { platformFallbackOrganization } from "@/lib/organization";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const session: AuthSession = {
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
      role: "ADMIN",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCsrfToken();
});

function AuthProbe() {
  const auth = useAuth();
  return (
    <p>
      {auth.isLoading
        ? "loading"
        : auth.isAuthenticated
          ? auth.memberships[0]?.organization_name
          : "anonymous"}
    </p>
  );
}

describe("AuthProvider", () => {
  it("exposes an unauthenticated state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText("anonymous")).toBeInTheDocument();
  });

  it("exposes an authenticated user and memberships", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ csrf_token: "hydrated-token" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText("Example Org")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/csrf"),
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("LoginForm", () => {
  it("renders and submits credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ csrf_token: "login-token" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <LoginForm organization={platformFallbackOrganization} />
      </AuthProvider>,
    );
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
      target: { value: "staff@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "correct password" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/example/admin"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/login"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("shows a generic invalid-credentials error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(new Response(null, { status: 401 })),
    );
    render(
      <AuthProvider>
        <LoginForm organization={platformFallbackOrganization} />
      </AuthProvider>,
    );
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
      target: { value: "unknown@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ungültig");
  });
});

describe("LogoutButton", () => {
  it("sends the hydrated CSRF token when the API cookie is not readable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return Response.json(session);
      if (url.endsWith("/api/auth/csrf")) return Response.json({ csrf_token: "logout-token" });
      if (url.endsWith("/api/auth/logout")) return Response.json({ ok: true });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/csrf"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/logout"),
        expect.objectContaining({
          method: "POST",
          headers: { "X-CSRF-Token": "logout-token" },
        }),
      ),
    );
  });
});

describe("AdminShell", () => {
  it("renders an unauthenticated state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(
      <AuthProvider>
        <AdminShell org="example" organization={platformFallbackOrganization} />
      </AuthProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Anmeldung erforderlich" }),
    ).toBeInTheDocument();
  });

  it("renders a forbidden state without route membership", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...session, memberships: [] }))
        .mockResolvedValueOnce(Response.json({ csrf_token: "hydrated-token" })),
    );
    render(
      <AuthProvider>
        <AdminShell org="other" organization={platformFallbackOrganization} />
      </AuthProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Kein Zugriff" })).toBeInTheDocument();
  });
});

it("renders one organization switch link per membership", () => {
  render(
    <OrganizationSwitcher
      memberships={[
        session.memberships[0]!,
        {
          organization_id: "org-2",
          organization_slug: "second",
          organization_name: "Second Org",
          role: "KIOSK",
        },
      ]}
      currentSlug="example"
    />,
  );
  expect(screen.getByRole("link", { name: "Example Org" })).toHaveAttribute(
    "href",
    "/example/admin",
  );
  expect(screen.getByRole("link", { name: "Second Org" })).toHaveAttribute("href", "/second/admin");
  expect(screen.getByRole("link", { name: "Example Org" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Example Org" })).toHaveClass("bg-primary");
  expect(screen.getByRole("link", { name: "Second Org" })).not.toHaveClass("bg-primary");
});

describe("public token forms", () => {
  it("shows reset success and invalid states", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<ResetPasswordForm token="reset-token" />);
    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "long-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(await screen.findByText("Ihr Passwort wurde geändert.")).toBeInTheDocument();
    first.unmount();
    render(<ResetPasswordForm token="bad-token" />);
    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "long-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ungültig");
  });

  it("lets an existing active user accept without a display name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <InvitationForm
        token="invite-token"
        preview={{ organization_name: "Example Org", role: "ADMIN", password_required: false }}
      />,
    );
    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.queryByLabelText("Anzeigename")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Passwort")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Einladung annehmen" }));
    expect(await screen.findByText("Die Einladung wurde angenommen.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/accept-invitation"),
      expect.objectContaining({
        body: JSON.stringify({ token: "invite-token", display_name: null, password: null }),
      }),
    );
  });

  it("requires a display name and password for a new invited user", () => {
    render(
      <InvitationForm
        token="new-user-token"
        preview={{
          organization_name: "Example Org",
          role: "KOORDINATION",
          password_required: true,
        }}
      />,
    );
    expect(screen.getByText("Koordination")).toBeInTheDocument();
    expect(screen.getByLabelText("Anzeigename")).toBeRequired();
    expect(screen.getByLabelText("Passwort")).toBeRequired();
  });

  it("shows invalid invitations safely", () => {
    render(<InvitationForm token="bad-token" preview={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("ungültig");
  });
});
