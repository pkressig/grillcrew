import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadAdminPlanningData } = vi.hoisted(() => ({
  loadAdminPlanningData: vi.fn(),
}));

vi.mock("@/lib/admin-planning-data", () => ({ loadAdminPlanningData }));

import { MatchdayOverviewPanel } from "@/app/[org]/admin/matchday-overview-panel";

const event = {
  id: "event-1",
  season_id: "season-1",
  title: "FC Heim – FC Gast",
  date: "2026-09-12",
  location: "Sportplatz",
  event_type: "Aktive",
  public_description: "FC Heim 1 – Gastteam",
  internal_note: null,
  status: "PUBLISHED",
  published_at: "2026-07-01T10:00:00Z",
  kickoff_time: "16:00:00",
};

const kioskShift = {
  id: "kiosk-shift",
  event_id: "event-1",
  starts_at: "2026-09-12T14:00:00Z",
  ends_at: "2026-09-12T16:00:00Z",
  required_volunteers: 2,
  occupied_volunteers: 1,
  open_places: 1,
  signups: [
    {
      id: "signup-1",
      public_name: "Mia Muster",
      first_name: "Mia",
      last_name: "Muster",
      phone: "+41 79 123 45 67",
      email: "mia@example.test",
      outcome: "OPEN",
      created_at: "2026-07-21T10:00:00Z",
    },
  ],
  public_note: null,
  internal_note: null,
  status: "OPEN",
  sort_order: 0,
  shift_type: "KIOSK",
  assignment_mode: "OPEN_SIGNUP",
  menu_type: null,
  crew_suggestion_overridden: false,
};

describe("MatchdayOverviewPanel", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    loadAdminPlanningData.mockResolvedValue({ events: [event], shifts: [kioskShift] });
  });

  it("lists a matchday row collapsed by default with coverage badges", async () => {
    render(<MatchdayOverviewPanel org="club" timezone="Europe/Zurich" />);
    const summary = await screen.findByLabelText(/Spieltag .* anzeigen/);
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Kiosk offen")).toBeInTheDocument();
    expect(screen.getByText("Grill offen")).toBeInTheDocument();
  });

  it("reveals assigned helpers and the matches for that day when expanded", async () => {
    render(<MatchdayOverviewPanel org="club" timezone="Europe/Zurich" />);
    const summary = await screen.findByLabelText(/Spieltag .* anzeigen/);
    fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Mia Muster")).toBeInTheDocument();
    expect(screen.getByText(/\+41 79 123 45 67/)).toBeInTheDocument();
    expect(screen.getByText("Aktive")).toBeInTheDocument();
    expect(screen.getByText("FC Heim 1 – Gastteam")).toBeInTheDocument();
    expect(screen.getByText("FC Heim – FC Gast")).toBeInTheDocument();
  });

  it("shows an honest empty state when there are no matchdays", async () => {
    loadAdminPlanningData.mockResolvedValue({ events: [], shifts: [] });
    render(<MatchdayOverviewPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByText("Keine Spieltage")).toBeInTheDocument();
  });

  it("switches to the past tab and filters matchdays by date", async () => {
    render(<MatchdayOverviewPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByLabelText(/Spieltag .* anzeigen/);
    fireEvent.click(screen.getByRole("tab", { name: "Vergangene" }));
    expect(await screen.findByText("Keine vergangenen Spieltage")).toBeInTheDocument();
  });

  it("offers recovery after a loading error", async () => {
    loadAdminPlanningData.mockRejectedValueOnce(new Error("Netzwerkfehler"));
    render(<MatchdayOverviewPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Netzwerkfehler");
  });
});
