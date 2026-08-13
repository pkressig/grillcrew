import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/app/register/register-form";
import { platformFallbackOrganization } from "@/lib/organization";
import { registerVolunteer } from "@/lib/volunteer-profile";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/volunteer-profile", () => ({ registerVolunteer: vi.fn() }));

const mockedRegister = vi.mocked(registerVolunteer);
const organization = { ...platformFallbackOrganization, slug: "example" };
const otherOrganization = { ...platformFallbackOrganization, slug: "other" };
const draftKey = "grillcrew.register-draft.example";

describe("RegisterForm draft persistence", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockedRegister.mockReset();
  });
  afterEach(cleanup);

  it("writes non-sensitive field changes to sessionStorage but never the password", async () => {
    render(<RegisterForm organization={organization} />);
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mia@example.test" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "super-secret-pw" } });

    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).not.toBeNull());
    const stored = JSON.parse(window.sessionStorage.getItem(draftKey) ?? "{}");
    expect(stored.first_name).toBe("Mia");
    expect(stored.email).toBe("mia@example.test");
    expect(stored).not.toHaveProperty("password");
    expect(JSON.stringify(stored)).not.toContain("super-secret-pw");
  });

  it("restores a draft after the form unmounts and remounts, but not the password", async () => {
    const { unmount } = render(<RegisterForm organization={organization} />);
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "+41 79 123 45 67" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mia@example.test" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "super-secret-pw" } });
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).not.toBeNull());
    unmount();

    render(<RegisterForm organization={organization} />);
    expect(screen.getByLabelText("Vorname")).toHaveValue("Mia");
    expect(screen.getByLabelText("Nachname")).toHaveValue("Muster");
    expect(screen.getByLabelText("Telefon")).toHaveValue("+41 79 123 45 67");
    expect(screen.getByLabelText("E-Mail")).toHaveValue("mia@example.test");
    expect(screen.getByLabelText("Passwort")).toHaveValue("");
  });

  it("clears the draft after a successful submission", async () => {
    mockedRegister.mockResolvedValue({ ok: true });
    render(<RegisterForm organization={organization} />);
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "+41 79 123 45 67" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mia@example.test" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "super-secret-pw" } });
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));
    await waitFor(() => expect(mockedRegister).toHaveBeenCalled());
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).toBeNull());
  });

  it("keys the draft per organization slug to avoid cross-tenant bleed", async () => {
    const { unmount } = render(<RegisterForm organization={organization} />);
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).not.toBeNull());
    unmount();

    render(<RegisterForm organization={otherOrganization} />);
    expect(screen.getByLabelText("Vorname")).toHaveValue("");
    expect(screen.getByLabelText("Vorname des Kindes")).toHaveValue("");
  });
});
