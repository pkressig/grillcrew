import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "@/app/reset-password/[token]/reset-password-form";
import { platformFallbackOrganization } from "@/lib/organization";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

const organization = {
  ...platformFallbackOrganization,
  name: "FC Beispiel",
  slug: "fc-beispiel",
  settings: { ...platformFallbackOrganization.settings, volunteer_password_min_length: 8 },
};

function sessionBody(memberships: { organization_slug: string }[] = []) {
  return {
    ok: true,
    session: {
      user: { id: "user-1", email_normalized: "user@example.test", display_name: null },
      memberships,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replaceMock.mockReset();
});

describe("ResetPasswordForm", () => {
  it("shows the organization's branding and its configured minimum password length", () => {
    render(<ResetPasswordForm token="raw-token" organization={organization} />);
    expect(screen.getByText("FC Beispiel")).toBeInTheDocument();
    expect(screen.getByText("Mindestens 8 Zeichen.")).toBeInTheDocument();
    expect(screen.getByLabelText("Neues Passwort")).toHaveAttribute("minLength", "8");
  });

  it("logs the volunteer in and redirects to the org overview on success", async () => {
    const fetchMock = vi.fn(async () => Response.json(sessionBody([])));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResetPasswordForm token="raw-token" organization={organization} />);

    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fc-beispiel"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/reset-password"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("redirects staff to their admin panel instead of the org overview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(sessionBody([{ organization_slug: "fc-beispiel" }]))),
    );
    render(<ResetPasswordForm token="raw-token" organization={organization} />);

    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fc-beispiel/admin"));
  });

  it("shows an error for an invalid or expired token instead of redirecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 400 })),
    );
    render(<ResetPasswordForm token="raw-token" organization={organization} />);

    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    expect(
      await screen.findByText(
        "Der Link ist ungültig oder abgelaufen. Fordern Sie einen neuen Link an.",
      ),
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
