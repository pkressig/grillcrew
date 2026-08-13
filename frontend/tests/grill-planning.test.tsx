import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadPlanningProposals,
  refreshPlanningProposals,
  updatePlanningProposal,
  confirmPlanningProposal,
  updateGrillShiftSplits,
} = vi.hoisted(() => ({
  loadPlanningProposals: vi.fn(),
  refreshPlanningProposals: vi.fn(),
  updatePlanningProposal: vi.fn(),
  confirmPlanningProposal: vi.fn(),
  updateGrillShiftSplits: vi.fn(),
}));

vi.mock("@/lib/proposals", () => ({
  loadPlanningProposals,
  refreshPlanningProposals,
  updatePlanningProposal,
  confirmPlanningProposal,
  updateGrillShiftSplits,
}));

const { loadShifts, updateShift } = vi.hoisted(() => ({
  loadShifts: vi.fn(),
  updateShift: vi.fn(),
}));

vi.mock("@/lib/planning", () => ({ loadShifts, updateShift }));

import { GrillPlanningPanel } from "@/app/[org]/admin/grill-planning-panel";

const openWindow = {
  id: "window-1",
  date: "2026-08-08",
  start_at: "2026-08-08T10:30:00+02:00",
  end_at: "2026-08-08T15:30:00+02:00",
  kiosk_open: true,
  kiosk_confirmed: true,
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
    updateGrillShiftSplits.mockResolvedValue({ ...openWindow });
    loadShifts.mockResolvedValue([]);
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

  it("never offers a grill proposal for a kiosk window that has not been confirmed", async () => {
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, id: "unconfirmed", kiosk_confirmed: false }],
    });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByText("Keine offenen Kioskfenster")).toBeInTheDocument();
    expect(screen.queryByText("Junioren A – Gäste")).not.toBeInTheDocument();
  });

  it("persists an edited grill slot count before confirming so it is never silently discarded", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    confirmPlanningProposal.mockResolvedValue({ ...openWindow, grill_confirmed: true });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A – Gäste");

    // Edit the slot count but deliberately do NOT click "Anpassung speichern"
    // first — confirming directly must still use the freshly typed value.
    fireEvent.change(screen.getByLabelText("Grillplätze"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Grill-Vorschlag bestätigen" }));

    await waitFor(() =>
      expect(updatePlanningProposal).toHaveBeenCalledWith("club", "window-1", {
        grill_required: true,
        proposed_grill_slots: 5,
      }),
    );
    await waitFor(() =>
      expect(confirmPlanningProposal).toHaveBeenCalledWith("club", "window-1", { kind: "grill" }),
    );
    const [updateOrder] = updatePlanningProposal.mock.invocationCallOrder;
    const [confirmOrder] = confirmPlanningProposal.mock.invocationCallOrder;
    expect(updateOrder).toBeDefined();
    expect(confirmOrder).toBeDefined();
    expect(updateOrder as number).toBeLessThan(confirmOrder as number);
  });

  it("saves a manual split into two timed shifts with their own headcounts", async () => {
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A – Gäste");

    fireEvent.click(screen.getByRole("button", { name: "+ Zeitfenster" }));
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "14:00" } });
    fireEvent.change(screen.getByLabelText("Helfer"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Aufteilung speichern" }));

    // Europe/Zurich is UTC+2 in August (CEST): 10:00/14:00 local -> 08:00/12:00Z.
    await waitFor(() =>
      expect(updateGrillShiftSplits).toHaveBeenCalledWith("club", "window-1", [
        {
          starts_at: "2026-08-08T08:00:00.000Z",
          ends_at: "2026-08-08T12:00:00.000Z",
          required_volunteers: 1,
        },
      ]),
    );
  });

  it("persists an unsaved shift split before confirming so it is never silently discarded", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    confirmPlanningProposal.mockResolvedValue({ ...openWindow, grill_confirmed: true });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A – Gäste");

    // Add a split but deliberately do NOT click "Aufteilung speichern" first.
    fireEvent.click(screen.getByRole("button", { name: "+ Zeitfenster" }));
    fireEvent.click(screen.getByRole("button", { name: "Grill-Vorschlag bestätigen" }));

    await waitFor(() =>
      expect(updateGrillShiftSplits).toHaveBeenCalledWith("club", "window-1", [
        expect.objectContaining({ required_volunteers: 1 }),
      ]),
    );
    await waitFor(() =>
      expect(confirmPlanningProposal).toHaveBeenCalledWith("club", "window-1", { kind: "grill" }),
    );
    const [splitsOrder] = updateGrillShiftSplits.mock.invocationCallOrder;
    const [confirmOrder] = confirmPlanningProposal.mock.invocationCallOrder;
    expect(splitsOrder as number).toBeLessThan(confirmOrder as number);
  });

  it("offers a reconcile action for an already-confirmed window that re-runs confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, grill_confirmed: true }],
    });
    confirmPlanningProposal.mockResolvedValue({ ...openWindow, grill_confirmed: true });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A – Gäste");

    fireEvent.click(screen.getByRole("button", { name: "Schichten abgleichen" }));

    await waitFor(() =>
      expect(confirmPlanningProposal).toHaveBeenCalledWith("club", "window-1", { kind: "grill" }),
    );
    // Reconciling must never re-send grill_required/proposed_grill_slots or
    // splits — it only re-runs the server-side shift materialisation against
    // whatever is already saved.
    expect(updatePlanningProposal).not.toHaveBeenCalled();
    expect(updateGrillShiftSplits).not.toHaveBeenCalled();
  });

  it("hides cancelled shifts in the confirmed shift list (e.g. after reconciling)", async () => {
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, grill_confirmed: true, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "stale-shift",
        event_id: "event-1",
        starts_at: "2026-08-08T18:00:00Z",
        ends_at: "2026-08-08T20:00:00Z",
        required_volunteers: 2,
        occupied_volunteers: 0,
        open_places: 2,
        signups: [],
        public_note: null,
        internal_note: null,
        status: "CANCELLED",
        sort_order: 0,
        shift_type: "GRILL",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
      {
        id: "active-shift",
        event_id: "event-1",
        starts_at: "2026-08-08T18:00:00Z",
        ends_at: "2026-08-08T19:00:00Z",
        required_volunteers: 1,
        occupied_volunteers: 0,
        open_places: 1,
        signups: [],
        public_note: null,
        internal_note: null,
        status: "OPEN",
        sort_order: 0,
        shift_type: "GRILL",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
    ]);
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);

    await screen.findByText("Junioren A – Gäste");
    expect(await screen.findByText("20:00–21:00 Uhr")).toBeInTheDocument();
    expect(screen.queryByText("20:00–22:00 Uhr")).not.toBeInTheDocument();
  });

  it("lets an admin adjust a confirmed shift's time and headcount via Anpassen", async () => {
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, grill_confirmed: true, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "shift-1",
        event_id: "event-1",
        starts_at: "2026-08-08T18:00:00Z",
        ends_at: "2026-08-08T19:00:00Z",
        required_volunteers: 1,
        occupied_volunteers: 0,
        open_places: 1,
        signups: [],
        public_note: null,
        internal_note: null,
        status: "OPEN",
        sort_order: 0,
        shift_type: "GRILL",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
    ]);
    updateShift.mockResolvedValue({
      id: "shift-1",
      event_id: "event-1",
      starts_at: "2026-08-08T18:30:00Z",
      ends_at: "2026-08-08T19:30:00Z",
      required_volunteers: 2,
      occupied_volunteers: 0,
      open_places: 2,
      signups: [],
      public_note: null,
      internal_note: null,
      status: "OPEN",
      sort_order: 0,
      shift_type: "GRILL",
      assignment_mode: "OPEN_SIGNUP",
      menu_type: null,
      crew_suggestion_overridden: false,
    });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);

    await screen.findByText("Junioren A – Gäste");
    expect(await screen.findByText("20:00–21:00 Uhr")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Anpassen" }));
    fireEvent.change(screen.getByLabelText("Helfer"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(updateShift).toHaveBeenCalledWith(
        "club",
        "shift-1",
        expect.objectContaining({ required_volunteers: 2 }),
      ),
    );
    expect(await screen.findByText("20:30–21:30 Uhr")).toBeInTheDocument();
  });

  it("switches to the past tab and requests past proposals separately", async () => {
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A – Gäste");
    expect(loadPlanningProposals).toHaveBeenLastCalledWith("club", false);

    fireEvent.click(screen.getByRole("tab", { name: "Vergangene" }));

    await waitFor(() => expect(loadPlanningProposals).toHaveBeenLastCalledWith("club", true));
  });
});
