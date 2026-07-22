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

function renderPage() {
  return render(
    <OrganizationProvider organization={{ ...platformFallbackOrganization, slug: "example" }}>
      <ManagedSignupPage token="secret-token" />
    </OrganizationProvider>,
  );
}

describe("ManagedSignupPage", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedCancel.mockReset();
  });
  afterEach(cleanup);

  it("loads token-holder details and cancels after confirmation", async () => {
    mockedFetch.mockResolvedValue(active);
    mockedCancel.mockResolvedValue({
      ...active,
      signup_status: "CANCELLED_BY_VOLUNTEER",
      can_cancel: false,
      cancelled_at: "2026-08-01T10:00:00Z",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    expect(await screen.findByText("mia@example.test")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Eintragung endgültig absagen" });
    expect(button).toHaveClass("min-h-11");
    fireEvent.click(button);
    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith("example", "secret-token"));
    expect(await screen.findByText("Diese Eintragung ist abgesagt.")).toBeInTheDocument();
  });

  it("shows the invalid-link state", async () => {
    mockedFetch.mockRejectedValue(new Error("not found"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Link nicht gültig" })).toBeInTheDocument();
  });

  it("shows guidance without a cancellation button after the deadline", async () => {
    mockedFetch.mockResolvedValue({
      ...active,
      can_cancel: false,
      cancellation_guidance: "Bitte kontaktiere die Koordination.",
    });
    renderPage();
    expect(await screen.findByText("Direkte Absage nicht mehr möglich")).toBeInTheDocument();
    expect(screen.getByText("Bitte kontaktiere die Koordination.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /absagen/ })).not.toBeInTheDocument();
  });
});
