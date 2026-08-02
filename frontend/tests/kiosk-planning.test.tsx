import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KioskPlanningPanel } from "@/app/[org]/admin/kiosk-planning-panel";
import * as proposals from "@/lib/proposals";

vi.mock("@/lib/proposals", () => ({
  loadPlanningProposals: vi.fn(),
  refreshPlanningProposals: vi.fn(),
  updatePlanningProposal: vi.fn(),
}));

const windowProposal = {
  id: "window-1",
  date: "2026-09-12",
  start_at: "2026-09-12T08:30:00Z",
  end_at: "2026-09-12T12:30:00Z",
  kiosk_open: true,
  grill_required: true,
  proposed_grill_slots: 1,
  override_state: "PROPOSAL" as const,
  split_reason: "Pause von mehr als 240 Minuten zum nächsten Spiel",
  venues: ["Sportplatz"],
  crew_rule_context: null,
  games: [
    { title: "Junioren A – FC Beispiel", kickoff_at: "2026-09-12T09:00:00Z", venue: "Sportplatz" },
    { title: "Aktive – FC Muster", kickoff_at: "2026-09-12T12:00:00Z", venue: "Sportplatz" },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Kiosk planning", () => {
  it("renders grouped proposals, provenance, covered games, and split context", async () => {
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [windowProposal] });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    expect(screen.getByText("Kiosk-Vorschläge werden geladen …")).toBeInTheDocument();
    const day = await screen.findByRole("heading", { level: 2, name: /12. September 2026/i });
    const section = day.closest("section")!;
    expect(within(section).getByText("Kiosk vorgeschlagen")).toBeInTheDocument();
    expect(within(section).getByText(/Entwurf aus dem Spielbetrieb/)).toBeInTheDocument();
    expect(within(section).getByText(/mehr als 240 Minuten/)).toBeInTheDocument();
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("window-1")).not.toBeInTheDocument();
  });

  it("shows the honest empty state and regenerates proposals", async () => {
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [] });
    vi.mocked(proposals.refreshPlanningProposals).mockResolvedValue({ windows: [windowProposal] });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByRole("heading", { name: "Keine Kiosk-Zeitfenster" });
    fireEvent.click(
      screen.getByRole("button", { name: /Vorschläge aus Spielbetrieb aktualisieren/ }),
    );
    await screen.findByText("Vorschläge aus dem Spielbetrieb wurden aktualisiert.");
    expect(proposals.refreshPlanningProposals).toHaveBeenCalledWith("example");
    expect(screen.getByText("Kiosk vorgeschlagen")).toBeInTheDocument();
  });

  it("allows an accessible manual time and open-state override", async () => {
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [windowProposal] });
    vi.mocked(proposals.updatePlanningProposal).mockResolvedValue({
      ...windowProposal,
      kiosk_open: false,
      override_state: "MANUAL",
    });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    fireEvent.click(await screen.findByRole("button", { name: "Manuell anpassen" }));
    const start = screen.getByLabelText("Beginn");
    const end = screen.getByLabelText("Ende");
    expect(start).toHaveAttribute("type", "datetime-local");
    expect(end).toHaveAttribute("type", "datetime-local");
    fireEvent.click(screen.getByLabelText("Kiosk-Betrieb vorsehen"));
    fireEvent.click(screen.getByRole("button", { name: "Anpassung speichern" }));

    await waitFor(() =>
      expect(proposals.updatePlanningProposal).toHaveBeenCalledWith(
        "example",
        "window-1",
        expect.objectContaining({ kiosk_open: false }),
      ),
    );
    expect(await screen.findByText(/Manuell angepasst/)).toBeInTheDocument();
    expect(screen.getByText("Kiosk nicht vorgesehen")).toBeInTheDocument();
  });

  it("offers retry after a loading error", async () => {
    vi.mocked(proposals.loadPlanningProposals)
      .mockRejectedValueOnce(new Error("Server nicht erreichbar"))
      .mockResolvedValueOnce({ windows: [] });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Server nicht erreichbar");
    fireEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    await screen.findByRole("heading", { name: "Keine Kiosk-Zeitfenster" });
    expect(proposals.loadPlanningProposals).toHaveBeenCalledTimes(2);
  });
});
