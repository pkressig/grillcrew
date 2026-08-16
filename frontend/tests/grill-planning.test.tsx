import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadPlanningProposals,
  refreshPlanningProposals,
  updatePlanningProposal,
  confirmPlanningProposal,
  updateGrillShiftSplits,
  deleteConfirmedWindow,
} = vi.hoisted(() => ({
  loadPlanningProposals: vi.fn(),
  refreshPlanningProposals: vi.fn(),
  updatePlanningProposal: vi.fn(),
  confirmPlanningProposal: vi.fn(),
  updateGrillShiftSplits: vi.fn(),
  deleteConfirmedWindow: vi.fn(),
}));

vi.mock("@/lib/proposals", () => ({
  loadPlanningProposals,
  refreshPlanningProposals,
  updatePlanningProposal,
  confirmPlanningProposal,
  updateGrillShiftSplits,
  deleteConfirmedWindow,
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
      title: "Aktive",
      match_description: "FC Heim – Gäste",
      kickoff_at: "2026-08-08T14:00:00+02:00",
      venue: "Sportplatz 2",
    },
    {
      title: "Junioren A",
      match_description: "FC Heim – Gäste A",
      kickoff_at: "2026-08-08T11:00:00+02:00",
      venue: "Sportplatz",
    },
    {
      title: "Frauen",
      match_description: "FC Heim – Gäste F",
      kickoff_at: "2026-08-08T12:30:00+02:00",
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
    expect(await screen.findByText("Junioren A")).toBeInTheDocument();
    const games = screen.getByRole("region", { name: "Abgedeckte Spiele" });
    expect(games.querySelectorAll("li")).toHaveLength(3);
    expect([...games.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "11:00Junioren AFC Heim – Gäste A",
      "12:30FrauenFC Heim – Gäste F",
      "14:00AktiveFC Heim – Gäste",
    ]);
    expect(screen.queryByText("Sportplatz")).not.toBeInTheDocument();
    expect(screen.queryByText("Sportplatz 2")).not.toBeInTheDocument();
    expect(screen.getByText("Kiosk offen")).toBeInTheDocument();
    expect(screen.getByText("Crew-Regel: Junioren (3 Personen)")).toBeInTheDocument();
    expect(
      screen.getByText(/weder bestätigte Schichten noch öffentliche Anmeldungen/),
    ).toBeInTheDocument();
    expect(screen.queryByText("closed")).not.toBeInTheDocument();
  });

  it("shows a Kioskdeckung-fehlt tag only while the kiosk shift is understaffed", async () => {
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "kiosk-shift",
        event_id: "event-1",
        starts_at: "2026-08-08T08:30:00Z",
        ends_at: "2026-08-08T09:00:00Z",
        required_volunteers: 2,
        occupied_volunteers: 1,
        open_places: 1,
        signups: [],
        public_note: null,
        internal_note: null,
        status: "OPEN",
        sort_order: 0,
        shift_type: "KIOSK",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
    ]);
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A");
    expect(screen.getByText("Kioskdeckung fehlt")).toBeInTheDocument();
  });

  it("hides the Kioskdeckung-fehlt tag once the kiosk shift is fully staffed", async () => {
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "kiosk-shift",
        event_id: "event-1",
        starts_at: "2026-08-08T08:30:00Z",
        ends_at: "2026-08-08T09:00:00Z",
        required_volunteers: 1,
        occupied_volunteers: 1,
        open_places: 0,
        signups: [],
        public_note: null,
        internal_note: null,
        status: "OPEN",
        sort_order: 0,
        shift_type: "KIOSK",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
    ]);
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A");
    expect(screen.queryByText("Kioskdeckung fehlt")).not.toBeInTheDocument();
  });

  it("only shows the Grill-offen badge once a grill window is confirmed", async () => {
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A");
    expect(screen.queryByText("Grill offen")).not.toBeInTheDocument();
  });

  it("shows Grill offen and Grilldeckung fehlt for an understaffed confirmed grill shift", async () => {
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, grill_confirmed: true, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "grill-shift",
        event_id: "event-1",
        starts_at: "2026-08-08T18:00:00Z",
        ends_at: "2026-08-08T19:00:00Z",
        required_volunteers: 2,
        occupied_volunteers: 1,
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
    await screen.findByText("Junioren A");
    expect(screen.getByText("Grill offen")).toBeInTheDocument();
    expect(screen.getByText("Grilldeckung fehlt")).toBeInTheDocument();
  });

  it("saves a manual grill override", async () => {
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A");
    fireEvent.change(screen.getByLabelText("Grillstatus"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Anpassung speichern" }));
    await waitFor(() =>
      expect(updatePlanningProposal).toHaveBeenCalledWith("club", "window-1", {
        grill_required: false,
        proposed_grill_slots: 0,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("gespeichert");
    expect(
      screen.getByRole("region", { name: "Abgedeckte Spiele" }).querySelectorAll("li"),
    ).toHaveLength(3);
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
    expect((await screen.findAllByText("Junioren A")).at(-1)).toBeInTheDocument();
  });

  it("never offers a grill proposal for a kiosk window that has not been confirmed", async () => {
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, id: "unconfirmed", kiosk_confirmed: false }],
    });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByText("Keine offenen Kioskfenster")).toBeInTheDocument();
    expect(screen.queryByText("Junioren A")).not.toBeInTheDocument();
  });

  it("persists an edited grill slot count before confirming so it is never silently discarded", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    confirmPlanningProposal.mockResolvedValue({ ...openWindow, grill_confirmed: true });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A");

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
    await screen.findByText("Junioren A");

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
    await screen.findByText("Junioren A");

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
    await screen.findByText("Junioren A");

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

    await screen.findByText("Junioren A");
    expect(await screen.findByText("20:00–21:00 Uhr")).toBeInTheDocument();
    expect(screen.queryByText("20:00–22:00 Uhr")).not.toBeInTheDocument();
  });

  it("never shows a confirmed Kiosk shift in the Grill card's confirmed shift list", async () => {
    // loadShifts returns every shift for the event regardless of kind, since
    // a Kiosk and a Grill window can share the same underlying game/event —
    // the card must filter down to its own shift_type, not just status.
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, grill_confirmed: true, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "kiosk-shift",
        event_id: "event-1",
        starts_at: "2026-08-08T08:30:00Z",
        ends_at: "2026-08-08T09:00:00Z",
        required_volunteers: 1,
        occupied_volunteers: 0,
        open_places: 1,
        signups: [],
        public_note: null,
        internal_note: null,
        status: "CLOSED",
        sort_order: 0,
        shift_type: "KIOSK",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
      {
        id: "grill-shift",
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

    await screen.findByText("Junioren A");
    expect(await screen.findByText("20:00–21:00 Uhr")).toBeInTheDocument();
    expect(screen.queryByText("10:30–11:00 Uhr")).not.toBeInTheDocument();
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

    await screen.findByText("Junioren A");
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
    await screen.findByText("Junioren A");
    expect(loadPlanningProposals).toHaveBeenLastCalledWith("club", false);

    fireEvent.click(screen.getByRole("tab", { name: "Vergangene" }));

    await waitFor(() => expect(loadPlanningProposals).toHaveBeenLastCalledWith("club", true));
  });

  it("deletes a confirmed grill window, resetting the card back to the unconfirmed proposal form", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, grill_confirmed: true, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "grill-shift",
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
    deleteConfirmedWindow.mockResolvedValue({
      ...openWindow,
      grill_confirmed: false,
      covered_event_ids: ["event-1"],
    });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A");
    expect(await screen.findByText("20:00–21:00 Uhr")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Einsatz löschen" }));

    await waitFor(() =>
      expect(deleteConfirmedWindow).toHaveBeenCalledWith("club", "window-1", "grill"),
    );
    expect(
      await screen.findByRole("button", { name: "Grill-Vorschlag bestätigen" }),
    ).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("warns about existing signups before deleting a confirmed grill window", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    loadPlanningProposals.mockResolvedValue({
      windows: [{ ...openWindow, grill_confirmed: true, covered_event_ids: ["event-1"] }],
    });
    loadShifts.mockResolvedValue([
      {
        id: "grill-shift",
        event_id: "event-1",
        starts_at: "2026-08-08T18:00:00Z",
        ends_at: "2026-08-08T19:00:00Z",
        required_volunteers: 1,
        occupied_volunteers: 1,
        open_places: 0,
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
        shift_type: "GRILL",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
    ]);
    deleteConfirmedWindow.mockResolvedValue({ ...openWindow, grill_confirmed: false });
    render(<GrillPlanningPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Junioren A");
    expect(await screen.findByText("20:00–21:00 Uhr")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Einsatz löschen" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 bereits bestehenden Anmeldung"),
    );
    await waitFor(() => expect(deleteConfirmedWindow).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });
});
