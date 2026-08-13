import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KioskPlanningPanel } from "@/app/[org]/admin/kiosk-planning-panel";
import * as proposals from "@/lib/proposals";
import * as planningLib from "@/lib/planning";

vi.mock("@/lib/proposals", () => ({
  loadPlanningProposals: vi.fn(),
  refreshPlanningProposals: vi.fn(),
  updatePlanningProposal: vi.fn(),
  confirmPlanningProposal: vi.fn(),
  updateKioskShiftSplits: vi.fn(),
  deleteConfirmedWindow: vi.fn(),
}));

vi.mock("@/lib/planning", () => ({
  loadShifts: vi.fn(),
  updateShift: vi.fn(),
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
    { title: "Aktive – FC Muster", kickoff_at: "2026-09-12T12:00:00Z", venue: "Sportplatz" },
    { title: "Junioren A – FC Beispiel", kickoff_at: "2026-09-12T09:00:00Z", venue: "Sportplatz" },
    { title: "Frauen – FC Test", kickoff_at: "2026-09-12T10:30:00Z", venue: "Nebenplatz" },
  ],
};

beforeEach(() => {
  vi.mocked(planningLib.loadShifts).mockResolvedValue([]);
  vi.mocked(proposals.updateKioskShiftSplits).mockResolvedValue(windowProposal);
});

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
    const games = within(section).getByRole("region", { name: "Abgedeckte Spiele" });
    expect(within(games).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(games)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "11:00Junioren A – FC Beispiel",
      "12:30Frauen – FC Test",
      "14:00Aktive – FC Muster",
    ]);
    expect(within(section).queryByText("Sportplatz")).not.toBeInTheDocument();
    expect(within(section).queryByText("Nebenplatz")).not.toBeInTheDocument();
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
    expect(proposals.refreshPlanningProposals).toHaveBeenCalledWith("example", false);
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

    // Scoped to the card containing our own mocked message: the unrelated
    // ExternalPlanComparisonWorkspace embedded in this panel performs its own
    // real (unmocked) fetch and can independently render a second, unrelated
    // role="alert" card with its own "Erneut laden" button in the same test.
    const message = await screen.findByText("Server nicht erreichbar");
    const card = message.parentElement as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Erneut laden" }));
    await screen.findByRole("heading", { name: "Keine Kiosk-Zeitfenster" });
    expect(proposals.loadPlanningProposals).toHaveBeenCalledTimes(2);
  });

  it("pre-fills the manual shift-count editor from the persisted proposed slot count", async () => {
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({
      windows: [{ ...windowProposal, proposed_kiosk_slots: 4 }],
    });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    fireEvent.click(await screen.findByRole("button", { name: "Manuell anpassen" }));
    expect(screen.getByLabelText("Kiosk-Schichten")).toHaveValue(4);
  });

  it("reflects a refreshed confirmation state without needing a remount", async () => {
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({
      windows: [{ ...windowProposal, kiosk_confirmed: false }],
    });
    vi.mocked(proposals.refreshPlanningProposals).mockResolvedValue({
      windows: [{ ...windowProposal, kiosk_confirmed: true }],
    });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByRole("button", { name: "Kiosk-Vorschlag bestätigen" });
    fireEvent.click(
      screen.getByRole("button", { name: /Vorschläge aus Spielbetrieb aktualisieren/ }),
    );

    expect(await screen.findByText("Kiosk-Entwurf angelegt")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Kiosk-Vorschlag bestätigen" }),
    ).not.toBeInTheDocument();
  });

  it("switches to a separate past tab that requests and shows only past windows", async () => {
    const pastWindow = { ...windowProposal, id: "window-past", date: "2020-01-04" };
    vi.mocked(proposals.loadPlanningProposals).mockImplementation((_org, includePast) =>
      Promise.resolve({ windows: includePast ? [windowProposal, pastWindow] : [windowProposal] }),
    );
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByRole("heading", { level: 2, name: /12. September 2026/i });
    expect(proposals.loadPlanningProposals).toHaveBeenLastCalledWith("example", false);

    fireEvent.click(screen.getByRole("tab", { name: "Vergangene" }));

    await waitFor(() =>
      expect(proposals.loadPlanningProposals).toHaveBeenLastCalledWith("example", true),
    );
    await screen.findByRole("heading", { level: 2, name: /4. Januar 2020/i });
    expect(
      screen.queryByRole("heading", { level: 2, name: /12. September 2026/i }),
    ).not.toBeInTheDocument();
  });

  it("saves a manual split into two timed shifts with their own headcounts", async () => {
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [windowProposal] });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);
    await screen.findByRole("heading", { level: 2, name: /12. September 2026/i });

    fireEvent.click(screen.getByRole("button", { name: "+ Zeitfenster" }));
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "14:00" } });
    fireEvent.change(screen.getByLabelText("Helfer"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Aufteilung speichern" }));

    // Europe/Zurich is UTC+2 in September (CEST): 10:00/14:00 local -> 08:00/12:00Z.
    await waitFor(() =>
      expect(proposals.updateKioskShiftSplits).toHaveBeenCalledWith("example", "window-1", [
        {
          starts_at: "2026-09-12T08:00:00.000Z",
          ends_at: "2026-09-12T12:00:00.000Z",
          required_volunteers: 1,
        },
      ]),
    );
  });

  it("persists an unsaved shift split before confirming so it is never silently discarded", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [windowProposal] });
    vi.mocked(proposals.confirmPlanningProposal).mockResolvedValue({
      ...windowProposal,
      kiosk_confirmed: true,
    });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);
    await screen.findByRole("heading", { level: 2, name: /12. September 2026/i });

    // Add a split but deliberately do NOT click "Aufteilung speichern" first.
    fireEvent.click(screen.getByRole("button", { name: "+ Zeitfenster" }));
    fireEvent.click(screen.getByRole("button", { name: "Kiosk-Vorschlag bestätigen" }));

    await waitFor(() =>
      expect(proposals.updateKioskShiftSplits).toHaveBeenCalledWith("example", "window-1", [
        expect.objectContaining({ required_volunteers: 1 }),
      ]),
    );
    await waitFor(() =>
      expect(proposals.confirmPlanningProposal).toHaveBeenCalledWith("example", "window-1", {
        kind: "kiosk",
      }),
    );
    const [splitsOrder] = vi.mocked(proposals.updateKioskShiftSplits).mock.invocationCallOrder;
    const [confirmOrder] = vi.mocked(proposals.confirmPlanningProposal).mock.invocationCallOrder;
    expect(splitsOrder as number).toBeLessThan(confirmOrder as number);
  });

  it("renders confirmed shifts and lets an admin adjust one via Anpassen", async () => {
    const confirmedWindow = {
      ...windowProposal,
      kiosk_confirmed: true,
      covered_event_ids: ["event-1"],
    };
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [confirmedWindow] });
    vi.mocked(planningLib.loadShifts).mockResolvedValue([
      {
        id: "shift-1",
        event_id: "event-1",
        starts_at: "2026-09-12T08:30:00Z",
        ends_at: "2026-09-12T12:30:00Z",
        required_volunteers: 2,
        occupied_volunteers: 1,
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
    ]);
    vi.mocked(planningLib.updateShift).mockResolvedValue({
      id: "shift-1",
      event_id: "event-1",
      starts_at: "2026-09-12T09:00:00Z",
      ends_at: "2026-09-12T13:00:00Z",
      required_volunteers: 3,
      occupied_volunteers: 1,
      open_places: 2,
      signups: [],
      public_note: null,
      internal_note: null,
      status: "CLOSED",
      sort_order: 0,
      shift_type: "KIOSK",
      assignment_mode: "OPEN_SIGNUP",
      menu_type: null,
      crew_suggestion_overridden: false,
    });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByText("Kiosk-Entwurf angelegt");
    expect(screen.getByText("1 von 2 Helfer angemeldet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Anpassen" }));
    fireEvent.change(screen.getByLabelText("Helfer"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(planningLib.updateShift).toHaveBeenCalledWith(
        "example",
        "shift-1",
        expect.objectContaining({ required_volunteers: 3 }),
      ),
    );
    expect(await screen.findByText("1 von 3 Helfer angemeldet")).toBeInTheDocument();
  });

  it("offers a reconcile action for an already-confirmed window that re-runs confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const confirmedWindow = { ...windowProposal, kiosk_confirmed: true };
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [confirmedWindow] });
    vi.mocked(proposals.confirmPlanningProposal).mockResolvedValue(confirmedWindow);
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByText("Kiosk-Entwurf angelegt");
    fireEvent.click(screen.getByRole("button", { name: "Schichten abgleichen" }));

    await waitFor(() =>
      expect(proposals.confirmPlanningProposal).toHaveBeenCalledWith("example", "window-1", {
        kind: "kiosk",
      }),
    );
    expect(proposals.updateKioskShiftSplits).not.toHaveBeenCalled();
  });

  it("hides cancelled shifts in the confirmed shift list (e.g. after reconciling)", async () => {
    const confirmedWindow = {
      ...windowProposal,
      kiosk_confirmed: true,
      covered_event_ids: ["event-1"],
    };
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [confirmedWindow] });
    vi.mocked(planningLib.loadShifts).mockResolvedValue([
      {
        id: "stale-shift",
        event_id: "event-1",
        starts_at: "2026-09-12T08:30:00Z",
        ends_at: "2026-09-12T12:30:00Z",
        required_volunteers: 2,
        occupied_volunteers: 0,
        open_places: 2,
        signups: [],
        public_note: null,
        internal_note: null,
        status: "CANCELLED",
        sort_order: 0,
        shift_type: "KIOSK",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
      {
        id: "active-shift",
        event_id: "event-1",
        starts_at: "2026-09-12T08:30:00Z",
        ends_at: "2026-09-12T10:30:00Z",
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
    ]);
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByText("Kiosk-Entwurf angelegt");
    expect(await screen.findByText("10:30–12:30 Uhr")).toBeInTheDocument();
    expect(screen.queryByText("10:30–14:30 Uhr")).not.toBeInTheDocument();
  });

  it("never shows a confirmed Grill shift in the Kiosk card's confirmed shift list", async () => {
    // loadShifts returns every shift for the event regardless of kind, since
    // a Kiosk and a Grill window can share the same underlying game/event —
    // the card must filter down to its own shift_type, not just status.
    const confirmedWindow = {
      ...windowProposal,
      kiosk_confirmed: true,
      covered_event_ids: ["event-1"],
    };
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [confirmedWindow] });
    vi.mocked(planningLib.loadShifts).mockResolvedValue([
      {
        id: "grill-shift",
        event_id: "event-1",
        starts_at: "2026-09-12T18:00:00Z",
        ends_at: "2026-09-12T19:00:00Z",
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
      {
        id: "kiosk-shift",
        event_id: "event-1",
        starts_at: "2026-09-12T08:30:00Z",
        ends_at: "2026-09-12T09:00:00Z",
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
    ]);
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByText("Kiosk-Entwurf angelegt");
    expect(await screen.findByText("10:30–11:00 Uhr")).toBeInTheDocument();
    expect(screen.queryByText("20:00–21:00 Uhr")).not.toBeInTheDocument();
  });

  it("deletes a confirmed kiosk window, resetting the card back to the unconfirmed proposal form", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const confirmedWindow = {
      ...windowProposal,
      kiosk_confirmed: true,
      covered_event_ids: ["event-1"],
    };
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [confirmedWindow] });
    vi.mocked(planningLib.loadShifts).mockResolvedValue([
      {
        id: "kiosk-shift",
        event_id: "event-1",
        starts_at: "2026-09-12T08:30:00Z",
        ends_at: "2026-09-12T12:30:00Z",
        required_volunteers: 2,
        occupied_volunteers: 0,
        open_places: 2,
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
    ]);
    vi.mocked(proposals.deleteConfirmedWindow).mockResolvedValue({
      ...windowProposal,
      kiosk_confirmed: false,
      covered_event_ids: ["event-1"],
    });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByText("Kiosk-Entwurf angelegt");
    fireEvent.click(screen.getByRole("button", { name: "Einsatz löschen" }));

    await waitFor(() =>
      expect(proposals.deleteConfirmedWindow).toHaveBeenCalledWith("example", "window-1", "kiosk"),
    );
    expect(
      await screen.findByRole("button", { name: "Kiosk-Vorschlag bestätigen" }),
    ).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("warns about existing signups before deleting a confirmed kiosk window", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const confirmedWindow = {
      ...windowProposal,
      kiosk_confirmed: true,
      covered_event_ids: ["event-1"],
    };
    vi.mocked(proposals.loadPlanningProposals).mockResolvedValue({ windows: [confirmedWindow] });
    vi.mocked(planningLib.loadShifts).mockResolvedValue([
      {
        id: "kiosk-shift",
        event_id: "event-1",
        starts_at: "2026-09-12T08:30:00Z",
        ends_at: "2026-09-12T12:30:00Z",
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
        status: "CLOSED",
        sort_order: 0,
        shift_type: "KIOSK",
        assignment_mode: "OPEN_SIGNUP",
        menu_type: null,
        crew_suggestion_overridden: false,
      },
    ]);
    vi.mocked(proposals.deleteConfirmedWindow).mockResolvedValue({
      ...windowProposal,
      kiosk_confirmed: false,
    });
    render(<KioskPlanningPanel org="example" timezone="Europe/Zurich" />);

    await screen.findByText("Kiosk-Entwurf angelegt");
    fireEvent.click(screen.getByRole("button", { name: "Einsatz löschen" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 bereits bestehenden Anmeldung"),
    );
    await waitFor(() => expect(proposals.deleteConfirmedWindow).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });
});
