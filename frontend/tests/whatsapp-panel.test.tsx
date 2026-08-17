import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadAdminPlanningData } = vi.hoisted(() => ({ loadAdminPlanningData: vi.fn() }));
vi.mock("@/lib/admin-planning-data", () => ({ loadAdminPlanningData }));

const { loadFamilyVolunteers } = vi.hoisted(() => ({ loadFamilyVolunteers: vi.fn() }));
vi.mock("@/lib/families", () => ({ loadFamilyVolunteers }));

import { WhatsAppPanel } from "@/app/[org]/admin/whatsapp-panel";

const event = {
  id: "event-1",
  season_id: "season-1",
  title: "Sommerfest",
  date: "2026-09-05",
  location: "Sportplatz",
  event_type: "Vereinsanlass",
  public_description: null,
  internal_note: null,
  status: "PUBLISHED",
  published_at: "2026-08-01T10:00:00Z",
};

function shift(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "shift-1",
    event_id: "event-1",
    starts_at: "2026-09-05T16:00:00Z",
    ends_at: "2026-09-05T18:00:00Z",
    required_volunteers: 3,
    occupied_volunteers: 1,
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
    ...overrides,
  };
}

const grillVolunteer = {
  id: "volunteer-grill",
  first_name: "Lea",
  last_name: "Beispiel",
  phone: "079 111 11 11",
  email: "lea@example.test",
  compensation_preference: "WORK_HOURS",
  compensation_family_member_id: null,
  internal_note: null,
  status: "ACTIVE",
  is_grill_helper: true,
  is_kiosk_helper: false,
};
const kioskVolunteer = {
  ...grillVolunteer,
  id: "volunteer-kiosk",
  first_name: "Noah",
  last_name: "Muster",
  phone: "079 222 22 22",
  email: "noah@example.test",
  is_grill_helper: false,
  is_kiosk_helper: true,
};
const nonHelperVolunteer = {
  ...grillVolunteer,
  id: "volunteer-none",
  first_name: "Kein",
  last_name: "Helfer",
  is_grill_helper: false,
  is_kiosk_helper: false,
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-09-01T08:00:00Z"));
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  loadAdminPlanningData.mockResolvedValue({ events: [event], shifts: [shift()] });
  loadFamilyVolunteers.mockResolvedValue([grillVolunteer, kioskVolunteer, nonHelperVolunteer]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WhatsAppPanel", () => {
  it("shows the shift within the 10-day window with an open-places gap badge", async () => {
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByText("Sommerfest")).toBeInTheDocument();
    expect(screen.getByText(/1 von 3 belegt/)).toBeInTheDocument();
    expect(screen.getByText(/2 Plätze offen/)).toBeInTheDocument();
    expect(screen.getByText("Offene Deckungslücken")).toBeInTheDocument();
  });

  it("excludes shifts outside the 10-day window and cancelled shifts", async () => {
    loadAdminPlanningData.mockResolvedValue({
      events: [event, { ...event, id: "event-2", title: "Fernes Spiel" }],
      shifts: [
        shift({ id: "far-shift", event_id: "event-2", starts_at: "2026-10-01T16:00:00Z" }),
        shift({ id: "cancelled-shift", status: "CANCELLED" }),
      ],
    });
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    expect(
      await screen.findByText("Keine Einsätze in den nächsten 10 Tagen geplant."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Fernes Spiel")).not.toBeInTheDocument();
  });

  it("only lists Grill/Kiosk helpers, not a volunteer with neither flag", async () => {
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Sommerfest");
    expect(screen.getByText("Lea Beispiel")).toBeInTheDocument();
    expect(screen.getByText("Noah Muster")).toBeInTheDocument();
    expect(screen.queryByText("Kein Helfer")).not.toBeInTheDocument();
  });

  it("filters helpers by search", async () => {
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Sommerfest");
    fireEvent.change(screen.getByLabelText("Helfer suchen"), { target: { value: "noah" } });
    expect(screen.queryByText("Lea Beispiel")).not.toBeInTheDocument();
    expect(screen.getByText("Noah Muster")).toBeInTheDocument();
  });

  it("personalizes the message with the first name and builds a matching wa.me link", async () => {
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Sommerfest");
    const row = screen.getByText("Lea Beispiel").closest("li")!;
    fireEvent.click(within(row).getByRole("checkbox"));

    expect(await screen.findByText(/Hallo Lea,/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Per WhatsApp senden" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/41791111111"));
    expect(link).toHaveAttribute("href", expect.stringContaining(encodeURIComponent("Hallo Lea,")));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("copies the group message to the clipboard", async () => {
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Sommerfest");
    fireEvent.change(screen.getByLabelText("Gruppennachricht", { selector: "textarea" }), {
      target: { value: "Wir brauchen noch Helfer am Wochenende!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "In Zwischenablage kopieren" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "Wir brauchen noch Helfer am Wochenende!",
      ),
    );
    expect(await screen.findByRole("button", { name: "Kopiert!" })).toBeInTheDocument();
  });

  it("copies an AI context summary listing the open gap", async () => {
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Sommerfest");
    fireEvent.click(screen.getByRole("button", { name: "KI-Kontext kopieren" }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    const copiedText = vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0] as string;
    expect(copiedText).toContain("Sommerfest");
    expect(copiedText).toContain("1 von 3 Helfer");
    expect(copiedText).toContain("{Vorname}");
  });

  it("offers recovery after a loading error", async () => {
    loadAdminPlanningData.mockRejectedValueOnce(new Error("Netzwerkfehler"));
    render(<WhatsAppPanel org="club" timezone="Europe/Zurich" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Netzwerkfehler");
  });
});
