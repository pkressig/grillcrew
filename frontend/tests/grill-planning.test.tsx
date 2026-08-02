import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPlanningProposals, updatePlanningProposal, confirmPlanningProposal } = vi.hoisted(
  () => ({
    loadPlanningProposals: vi.fn(),
    updatePlanningProposal: vi.fn(),
    confirmPlanningProposal: vi.fn(),
  }),
);

vi.mock("@/lib/proposals", () => ({
  loadPlanningProposals,
  updatePlanningProposal,
  confirmPlanningProposal,
}));

import { GrillPlanningPanel } from "@/app/[org]/admin/grill-planning-panel";

const openWindow = {
  id: "window-1",
  date: "2026-08-08",
  start_at: "2026-08-08T10:30:00+02:00",
  end_at: "2026-08-08T15:30:00+02:00",
  kiosk_open: true,
  grill_required: true,
  proposed_grill_slots: 2,
  override_state: "PROPOSAL" as const,
  crew_rule_context: "Junioren (3 Personen)",
  games: [
    {
      title: "Junioren A – Gäste",
      kickoff_at: "2026-08-08T11:00:00+02:00",
      venue: "Sportplatz",
    },
  ],
};

describe("GrillPlanningPanel", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    loadPlanningProposals.mockResolvedValue({
      windows: [openWindow, { ...openWindow, id: "closed", kiosk_open: false }],
    });
    updatePlanningProposal.mockResolvedValue({ ...openWindow, override_state: "MANUAL" });
  });

  it("shows only open kiosk windows with games, rule context and proposal separation", async () => {
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    expect(screen.getByRole("status")).toHaveTextContent("werden geladen");
    expect(await screen.findByText("Junioren A – Gäste")).toBeInTheDocument();
    expect(screen.getByText("Kiosk offen")).toBeInTheDocument();
    expect(screen.getByText("Vorschlag")).toBeInTheDocument();
    expect(screen.getByText("Crew-Regel: Junioren (3 Personen)")).toBeInTheDocument();
    expect(
      screen.getByText(/weder bestätigte Schichten noch öffentliche Anmeldungen/),
    ).toBeInTheDocument();
    expect(screen.queryByText("closed")).not.toBeInTheDocument();
  });

  it("saves a manual grill override", async () => {
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A – Gäste");
    fireEvent.change(screen.getByLabelText("Grillstatus"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Anpassung speichern" }));
    await waitFor(() =>
      expect(updatePlanningProposal).toHaveBeenCalledWith("club", "window-1", {
        grill_required: false,
        proposed_grill_slots: 0,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("gespeichert");
  });

  it("renders the honest empty state when no kiosk window is open", async () => {
    loadPlanningProposals.mockResolvedValue({ windows: [{ ...openWindow, kiosk_open: false }] });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByText("Keine offenen Kioskfenster")).toBeInTheDocument();
  });

  it("offers recovery after a loading error", async () => {
    loadPlanningProposals.mockRejectedValueOnce(new Error("Netzwerkfehler"));
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Netzwerkfehler");
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect((await screen.findAllByText("Junioren A – Gäste")).at(-1)).toBeInTheDocument();
  });
});
