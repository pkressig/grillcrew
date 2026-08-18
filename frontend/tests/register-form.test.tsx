import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/app/register/register-form";
import { platformFallbackOrganization } from "@/lib/organization";
import { registerVolunteer } from "@/lib/volunteer-profile";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));
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
    fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
      target: { value: "super-secret-pw" },
    });
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

describe("RegisterForm multiple children", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockedRegister.mockReset();
  });
  afterEach(cleanup);

  it("adds another set of child fields, numbering both once there is more than one", () => {
    render(<RegisterForm organization={organization} />);
    expect(screen.getByLabelText("Vorname des Kindes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Weiteres Kind hinzufügen" }));
    expect(screen.getByLabelText("Vorname des Kindes 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Vorname des Kindes 2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Kind entfernen" })).toHaveLength(2);
  });

  it("removes a child block and renumbers back to unlabeled when only one remains", () => {
    render(<RegisterForm organization={organization} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Weiteres Kind hinzufügen" }));
    fireEvent.change(screen.getByLabelText("Vorname des Kindes 1"), {
      target: { value: "Lina" },
    });
    fireEvent.change(screen.getByLabelText("Vorname des Kindes 2"), {
      target: { value: "Nico" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Kind entfernen" })[0]!);
    expect(screen.getByLabelText("Vorname des Kindes")).toHaveValue("Nico");
    expect(screen.queryByRole("button", { name: "Kind entfernen" })).not.toBeInTheDocument();
  });

  it("submits a child per filled-in block and drops incomplete ones", async () => {
    mockedRegister.mockResolvedValue({ ok: true });
    render(<RegisterForm organization={organization} />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Vorname des Kindes"), {
      target: { value: "Lina" },
    });
    fireEvent.change(screen.getByLabelText("Nachname des Kindes"), {
      target: { value: "Muster" },
    });
    fireEvent.change(screen.getByLabelText("Mannschaft des Kindes"), {
      target: { value: "U12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Weiteres Kind hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Weiteres Kind hinzufügen" }));
    fireEvent.change(screen.getByLabelText("Vorname des Kindes 3"), {
      target: { value: "Nico" },
    });
    fireEvent.change(screen.getByLabelText("Nachname des Kindes 3"), {
      target: { value: "Muster" },
    });
    // The 2nd block is left entirely empty and must be dropped, not sent as a
    // half-filled child.
    fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));
    await waitFor(() => expect(mockedRegister).toHaveBeenCalled());
    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        children: [
          { first_name: "Lina", last_name: "Muster", team_name: "U12" },
          { first_name: "Nico", last_name: "Muster", team_name: undefined },
        ],
      }),
    );
  });
});

describe("RegisterForm password confirmation", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockedRegister.mockReset();
  });
  afterEach(cleanup);

  it("shows live feedback as the visitor types, before ever submitting", async () => {
    render(<RegisterForm organization={organization} />);
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "super-secret-pw" } });
    expect(screen.queryByText(/Passwörter/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
      target: { value: "typo-secret-pw" },
    });
    expect(await screen.findByText("Die Passwörter stimmen nicht überein.")).toBeInTheDocument();
    expect(screen.queryByText("Die Passwörter stimmen überein.")).not.toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
      target: { value: "super-secret-pw" },
    });
    expect(await screen.findByText("Die Passwörter stimmen überein.")).toBeInTheDocument();
    expect(screen.queryByText("Die Passwörter stimmen nicht überein.")).not.toBeInTheDocument();
  });

  it("shows a mismatch error and never submits when the passwords differ", async () => {
    render(<RegisterForm organization={organization} />);
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "+41 79 123 45 67" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mia@example.test" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "super-secret-pw" } });
    fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
      target: { value: "typo-secret-pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Passwörter stimmen nicht überein.",
    );
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("submits once both password fields match", async () => {
    mockedRegister.mockResolvedValue({ ok: true });
    render(<RegisterForm organization={organization} />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));
    await waitFor(() => expect(mockedRegister).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("RegisterForm autofill hints", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(cleanup);

  it("gives each account field its own autocomplete token instead of a shared 'name' hint", () => {
    // Regression test: phone and email previously shared autoComplete="name" with the name
    // fields, so a browser's saved-profile autofill wrote the person's name into every field,
    // including phone and email.
    render(<RegisterForm organization={organization} />);
    expect(screen.getByLabelText("Vorname")).toHaveAttribute("autocomplete", "given-name");
    expect(screen.getByLabelText("Nachname")).toHaveAttribute("autocomplete", "family-name");
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("E-Mail")).toHaveAttribute("autocomplete", "email");
  });

  it("opts the child fields out of autofill entirely, since they are not the account holder", () => {
    render(<RegisterForm organization={organization} />);
    expect(screen.getByLabelText("Vorname des Kindes")).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText("Nachname des Kindes")).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText("Mannschaft des Kindes")).toHaveAttribute("autocomplete", "off");
  });
});

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
  fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
  fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "+41 79 123 45 67" } });
  fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mia@example.test" } });
  fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "super-secret-pw" } });
  fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
    target: { value: "super-secret-pw" },
  });
}

describe("RegisterForm page navigation (default variant)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockedRegister.mockReset();
    replaceMock.mockReset();
  });
  afterEach(cleanup);

  it("returns to the org overview without a pending shift", async () => {
    mockedRegister.mockResolvedValue({ ok: true });
    render(<RegisterForm organization={organization} />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/example/grill"));
  });

  it("returns to the pending shift after a successful registration", async () => {
    mockedRegister.mockResolvedValue({ ok: true });
    render(<RegisterForm organization={organization} pendingShiftId="shift-1" />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/example/grill?shift=shift-1"));
  });

  it("navigates back to the org overview via the back button", () => {
    render(<RegisterForm organization={organization} />);
    fireEvent.click(screen.getByRole("button", { name: "Zurück zur Übersicht" }));
    expect(replaceMock).toHaveBeenCalledWith("/example/grill");
  });

  it("carries the pending shift and opens the login modal via the 'already registered' link", () => {
    render(<RegisterForm organization={organization} pendingShiftId="shift-1" />);
    expect(
      screen.getByRole("link", { name: "Bereits registriert? Zur Anmeldung" }),
    ).toHaveAttribute("href", "/example/grill?shift=shift-1&login=1");
  });

  it("opens the login modal via the 'already registered' link without a pending shift", () => {
    render(<RegisterForm organization={organization} />);
    expect(
      screen.getByRole("link", { name: "Bereits registriert? Zur Anmeldung" }),
    ).toHaveAttribute("href", "/example/grill?login=1");
  });

  it("does not show a back button or the direct login link for the modal variant", () => {
    render(<RegisterForm organization={organization} variant="modal" onSwitchToLogin={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Zurück zur Übersicht" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Bereits registriert? Zur Anmeldung" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the Kiosk overview when the area prop is kiosk", () => {
    render(<RegisterForm organization={organization} area="kiosk" />);
    fireEvent.click(screen.getByRole("button", { name: "Zurück zur Übersicht" }));
    expect(replaceMock).toHaveBeenCalledWith("/example/kiosk");
  });
});
