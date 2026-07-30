import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagedSignupPage } from "@/app/[org]/manage-signup/[token]/managed-signup-page";
import { OrganizationProvider } from "@/components/organization-provider";
import { platformFallbackOrganization } from "@/lib/organization";
import { cancelManagedSignup, fetchManagedSignup, type ManagedSignup } from "@/lib/public-plan";

vi.mock("@/lib/public-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-plan")>();
  return { ...actual, fetchManagedSignup: vi.fn(), cancelManagedSignup: vi.fn() };
});

const mockedFetch = vi.mocked(fetchManagedSignup);
const mockedCancel = vi.mocked(cancelManagedSignup);
const active: ManagedSignup = {
  organization_name: "Example Organization",
  organization_slug: "example",
  event_title: "Heimspiel",
  event_type: "Match",
  event_date: "2026-08-15",
  event_location: "Sportplatz",
  event_public_description: "Beim Haupteingang",
  shift_starts_at: "2026-08-15T10:00:00+02:00",
  shift_ends_at: "2026-08-15T12:00:00+02:00",
  shift_status: "OPEN",
  public_name: "Mia Muster",
  first_name: "Mia",
  last_name: "Muster",
  phone: "+41 79 123 45 67",
  email: "mia@example.test",
  signup_status: "ACTIVE",
  cancellation_deadline: "2026-08-07T23:59:59+02:00",
  can_cancel: true,
  cancellation_guidance: null,
  cancelled_at: null,
};

function renderPage(token = "secret-token") {
  return render(
    <OrganizationProvider organization={{ ...platformFallbackOrganization, slug: "example" }}>
      <ManagedSignupPage token={token} />
    </OrganizationProvider>,
  );
}

describe("ManagedSignupPage", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedCancel.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("preserves the organization and route token while loading the private signup", async () => {
    mockedFetch.mockResolvedValue(active);
    renderPage("one-time-management-token");

    expect(screen.getByRole("status")).toHaveTextContent("Eintragung wird geladen");
    await waitFor(() =>
      expect(mockedFetch).toHaveBeenCalledWith("example", "one-time-management-token"),
    );
    expect(await screen.findByRole("heading", { name: "Meine Eintragung" })).toBeInTheDocument();
  });

  it("uses shared visual tokens, responsive layout, accessible status, and a 44px control", async () => {
    mockedFetch.mockResolvedValue(active);
    renderPage();

    expect(await screen.findByText("Bestätigt")).toHaveClass("bg-status-success/10");
    expect(screen.getByText("Du bist verbindlich eingetragen.")).toHaveClass(
      "border-status-success/30",
      "text-status-success",
    );
    expect(screen.getByText("Anlass").parentElement?.parentElement).toHaveClass(
      "grid-cols-1",
      "sm:grid-cols-2",
    );
    const button = screen.getByRole("button", { name: "Eintragung endgültig absagen" });
    expect(button).toHaveClass("min-h-11", "bg-status-error", "w-full", "sm:w-auto");
  });

  it("shows contact details only with an explicit personal-link privacy notice", async () => {
    mockedFetch.mockResolvedValue(active);
    renderPage();

    expect(await screen.findByText("mia@example.test")).toBeInTheDocument();
    expect(screen.getByText("+41 79 123 45 67")).toBeInTheDocument();
    expect(
      screen.getByText(/nur über diesen persönlichen Link einsehbar und nicht öffentlich/),
    ).toBeInTheDocument();
  });

  it("cancels with the same token after confirmation and renders the cancelled state", async () => {
    mockedFetch.mockResolvedValue(active);
    mockedCancel.mockResolvedValue({
      ...active,
      signup_status: "CANCELLED_BY_VOLUNTEER",
      can_cancel: false,
      cancelled_at: "2026-08-01T10:00:00Z",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Eintragung endgültig absagen" }));
    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith("example", "secret-token"));
    expect(await screen.findByText("Diese Eintragung ist abgesagt.")).toBeInTheDocument();
    expect(screen.getByText("Abgesagt")).toHaveClass("bg-status-neutral/10");
    expect(screen.queryByRole("button", { name: /absagen/i })).not.toBeInTheDocument();
  });

  it("keeps the signup active when cancellation confirmation is declined", async () => {
    mockedFetch.mockResolvedValue(active);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Eintragung endgültig absagen" }));
    expect(mockedCancel).not.toHaveBeenCalled();
    expect(screen.getByText("Du bist verbindlich eingetragen.")).toBeInTheDocument();
  });

  it("shows an accessible semantic error if cancellation fails", async () => {
    mockedFetch.mockResolvedValue(active);
    mockedCancel.mockRejectedValue(new Error("network"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Eintragung endgültig absagen" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Die Absage ist nicht gelungen");
    expect(alert).toHaveClass("border-status-error/30", "text-status-error");
  });

  it("shows the invalid-link state", async () => {
    mockedFetch.mockRejectedValue(new Error("not found"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Link nicht gültig" })).toBeInTheDocument();
    expect(screen.getByText(/persönlichen Web-Link/)).toBeInTheDocument();
  });

  it("shows guidance without a cancellation button after the deadline", async () => {
    mockedFetch.mockResolvedValue({
      ...active,
      can_cancel: false,
      cancellation_guidance: "Bitte kontaktiere die Koordination.",
    });
    renderPage();

    const guidance = await screen.findByText("Direkte Absage nicht mehr möglich");
    expect(guidance).toHaveClass("text-status-warning");
    expect(screen.getByText("Bitte kontaktiere die Koordination.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /absagen/i })).not.toBeInTheDocument();
  });
});
