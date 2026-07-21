import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationProvider } from "@/components/organization-provider";
import { platformFallbackOrganization } from "@/lib/organization";
import { fetchPublicPlan } from "@/lib/public-plan";
import { OrganizationLanding, StateMessage } from "@/app/organization-landing";

vi.mock("@/lib/public-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-plan")>();
  return { ...actual, fetchPublicPlan: vi.fn() };
});

const mockedFetch = vi.mocked(fetchPublicPlan);
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
  beforeEach(() => mockedFetch.mockReset());
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
            },
          ],
        },
      ],
    });
    expect(await screen.findByRole("heading", { name: "Heimspiel" })).toBeInTheDocument();
    expect(screen.getByText("0 von 3 Plätzen besetzt")).toBeInTheDocument();
    const action = screen.getByRole("button", { name: /Bald eintragen: Heimspiel/ });
    expect(action).toBeDisabled();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByText(/internal|telefon|e-mail/i)).not.toBeInTheDocument();
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
