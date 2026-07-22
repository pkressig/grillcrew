import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationProvider } from "@/components/organization-provider";
import { platformFallbackOrganization } from "@/lib/organization";
import { createPublicSignup, fetchPublicPlan } from "@/lib/public-plan";
import { OrganizationLanding, StateMessage } from "@/app/organization-landing";

vi.mock("@/lib/public-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-plan")>();
  return { ...actual, fetchPublicPlan: vi.fn(), createPublicSignup: vi.fn() };
});

const mockedFetch = vi.mocked(fetchPublicPlan);
const mockedSignup = vi.mocked(createPublicSignup);
const organization = {
  ...platformFallbackOrganization,
  name: "Example Organization",
  slug: "example",
};
const renderPage = () =>
  render(
    <OrganizationProvider organization={organization}>
      <OrganizationLanding />
    </OrganizationProvider>,
  );

describe("OrganizationLanding", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSignup.mockReset();
  });
  afterEach(cleanup);

  it("renders loading, published event data, safe capacity and disabled named actions", async () => {
    let resolvePlan!: (value: Awaited<ReturnType<typeof fetchPublicPlan>>) => void;
    mockedFetch.mockReturnValue(
      new Promise((resolve) => {
        resolvePlan = resolve;
      }),
    );
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("geladen");
    resolvePlan({
      events: [
        {
          id: "event-1",
          title: "Heimspiel",
          date: "2026-08-01",
          location: "Sportplatz",
          event_type: "Match",
          public_description: "Haupteingang",
          shifts: [
            {
              id: "shift-1",
              starts_at: "2026-08-01T10:00:00+02:00",
              ends_at: "2026-08-01T12:00:00+02:00",
              required_volunteers: 3,
              occupied_volunteers: 0,
              public_note: "Schürze mitbringen",
              status: "OPEN",
              volunteer_names: [],
            },
          ],
        },
      ],
    });
    expect(await screen.findByRole("heading", { name: "Heimspiel" })).toBeInTheDocument();
    expect(screen.getByText("0 von 3 Plätzen besetzt")).toBeInTheDocument();
    const action = screen.getByRole("button", { name: /Eintragen: Heimspiel/ });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(screen.getByRole("form", { name: /Eintragung für Heimspiel/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Vorname")).toBeRequired();
    expect(screen.getByLabelText("Telefon")).toBeRequired();
    expect(screen.getByLabelText("E-Mail")).toBeRequired();
    expect(screen.getByLabelText(/Ich bin einverstanden/)).toBeRequired();
    expect(screen.getByLabelText("Website")).not.toBeVisible();
  });

  it("keeps input on failure and updates occupancy and public name on success", async () => {
    mockedFetch.mockResolvedValue({
      events: [
        {
          id: "event-1",
          title: "Heimspiel",
          date: "2026-08-01",
          location: "Sportplatz",
          event_type: "Match",
          public_description: null,
          shifts: [
            {
              id: "shift-1",
              starts_at: "2026-08-01T10:00:00+02:00",
              ends_at: "2026-08-01T12:00:00+02:00",
              required_volunteers: 2,
              occupied_volunteers: 0,
              public_note: null,
              status: "OPEN",
              volunteer_names: [],
            },
          ],
        },
      ],
    });
    mockedSignup.mockRejectedValueOnce(new Error("no"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Eintragen: Heimspiel/ }));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "+41 79 123 45 67" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mia@example.test" } });
    fireEvent.click(screen.getByLabelText(/Ich bin einverstanden/));
    fireEvent.submit(screen.getByRole("form"));
    expect(await screen.findByRole("alert")).toHaveTextContent("nicht gelungen");
    expect(screen.getByLabelText("Vorname")).toHaveValue("Mia");
    mockedSignup.mockResolvedValue({
      message: "Du bist eingetragen.",
      signup: { public_name: "Mia Muster", occupied_volunteers: 1, required_volunteers: 2 },
      management_url: "/example/manage-signup/secret-token",
    });
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(screen.getByText("1 von 2 Plätzen besetzt")).toBeInTheDocument());
    expect(screen.getByText("Eingetragen: Mia Muster")).toBeInTheDocument();
    expect(screen.queryByText("mia@example.test")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meine Eintragung öffnen" })).toHaveAttribute(
      "href",
      "/example/manage-signup/secret-token",
    );
    expect(screen.getByText(/Speichere oder öffne diesen Link/)).toBeInTheDocument();
    expect(screen.getByText(/Bestätigung per E-Mail gesendet/)).toBeInTheDocument();
  });

  it("allows closing the signup form using the cancel button", async () => {
    mockedFetch.mockResolvedValue({
      events: [
        {
          id: "event-1",
          title: "Heimspiel",
          date: "2026-08-01",
          location: "Sportplatz",
          event_type: "Match",
          public_description: null,
          shifts: [
            {
              id: "shift-1",
              starts_at: "2026-08-01T10:00:00+02:00",
              ends_at: "2026-08-01T12:00:00+02:00",
              required_volunteers: 2,
              occupied_volunteers: 0,
              public_note: null,
              status: "OPEN",
              volunteer_names: [],
            },
          ],
        },
      ],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Eintragen: Heimspiel/ }));
    expect(screen.getByRole("form", { name: /Eintragung für Heimspiel/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("renders a friendly empty state", async () => {
    mockedFetch.mockResolvedValue({ events: [] });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Noch keine Einsätze" })).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(
      <StateMessage title="Plan nicht verfügbar">Bitte versuche es später nochmals.</StateMessage>,
    );
    expect(screen.getByRole("heading", { name: "Plan nicht verfügbar" })).toBeInTheDocument();
  });
});
