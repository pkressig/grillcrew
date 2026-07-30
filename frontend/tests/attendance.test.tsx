import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendancePanel } from "@/app/[org]/admin/attendance-panel";

const season = {
  id: "season-1",
  club_year_id: "year-1",
  type: "AUTUMN",
  name: "Herbst",
  start_date: "2026-07-01",
  end_date: "2026-12-31",
  status: "ACTIVE",
};

const pastEvent = {
  id: "event-past",
  season_id: season.id,
  title: "Frühlingsfest",
  date: "2026-07-01",
  location: "Clubhaus",
  event_type: "Fest",
  public_description: null,
  internal_note: null,
  status: "COMPLETED",
  published_at: "2026-01-01T10:00:00Z",
};

const futureEvent = {
  ...pastEvent,
  id: "event-future",
  title: "Herbstturnier",
  date: "2027-09-12",
  location: "Sportplatz",
  status: "PUBLISHED",
};

const signup = (id: string, name: string, outcome: string) => ({
  id,
  public_name: name,
  first_name: name.split(" ")[0],
  last_name: name.split(" ")[1],
  phone: "+41 79 123 45 67",
  email: `${id}@example.test`,
  outcome,
  created_at: "2026-01-01T10:00:00Z",
});

const pastShift = {
  id: "shift-past",
  event_id: pastEvent.id,
  starts_at: "2026-07-01T08:00:00Z",
  ends_at: "2026-07-01T10:00:00Z",
  required_volunteers: 2,
  occupied_volunteers: 2,
  open_places: 0,
  signups: [signup("open-1", "Mia Muster", "OPEN"), signup("done-1", "Leo Beispiel", "ATTENDED")],
  public_note: null,
  internal_note: null,
  status: "CLOSED",
  sort_order: 0,
};

const futureShift = {
  ...pastShift,
  id: "shift-future",
  event_id: futureEvent.id,
  starts_at: "2027-09-12T08:00:00Z",
  ends_at: "2027-09-12T10:00:00Z",
  signups: [signup("future-1", "Nina Zukunft", "OPEN")],
  status: "OPEN",
};

function attendanceFetch(options?: { empty?: boolean; fail?: boolean; mutationFails?: boolean }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (options?.fail && url.endsWith("/club-years")) return new Response(null, { status: 500 });
    if (url.endsWith("/club-years")) return Response.json([]);
    if (url.endsWith("/seasons")) return Response.json(options?.empty ? [] : [season]);
    if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
    if (url.endsWith("/seasons/season-1/events")) return Response.json([pastEvent, futureEvent]);
    if (url.endsWith("/events/event-past/shifts")) return Response.json([pastShift]);
    if (url.endsWith("/events/event-future/shifts")) return Response.json([futureShift]);
    if (url.includes("/attendance") && method === "PATCH") {
      if (options?.mutationFails) return new Response(null, { status: 500 });
      const outcome = JSON.parse(String(init?.body)).outcome;
      return Response.json({ ...pastShift.signups[0], outcome });
    }
    return new Response(null, { status: 404 });
  });
}

function renderPanel(fetchMock = attendanceFetch()) {
  vi.stubGlobal("fetch", fetchMock);
  render(<AttendancePanel org="example" timezone="Europe/Zurich" />);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("attendance admin", () => {
  it("discards late planning data when the organization changes", async () => {
    let resolveOldEvents: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/club-years")) return Response.json([]);
      if (url.endsWith("/seasons/current")) return new Response(null, { status: 404 });
      if (url.endsWith("/seasons")) return Response.json([season]);
      if (url.includes("/api/admin/old/") && url.endsWith("/seasons/season-1/events"))
        return new Promise<Response>((resolve) => {
          resolveOldEvents = resolve;
        });
      if (url.endsWith("/seasons/season-1/events"))
        return Response.json([{ ...futureEvent, title: "Neuer Verein" }]);
      if (url.endsWith("/events/event-future/shifts")) return Response.json([futureShift]);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<AttendancePanel org="old" timezone="Europe/Zurich" />);

    await waitFor(() => expect(resolveOldEvents).toBeDefined());
    view.rerender(<AttendancePanel org="new" timezone="Europe/Zurich" />);
    expect(await screen.findAllByText("Neuer Verein")).toHaveLength(2);
    resolveOldEvents!(Response.json([{ ...pastEvent, title: "Alter Verein" }]));
    await Promise.resolve();

    expect(screen.queryByText("Alter Verein")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/new/seasons/season-1/events"),
      ),
    ).toBe(true);
  });

  it("renders loading, real-data summaries, separate semantic lists, and the planning link", async () => {
    renderPanel();
    expect(screen.getByRole("status")).toHaveTextContent("werden geladen");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Anwesenheit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zur Planung" })).toHaveAttribute(
      "href",
      "/example/admin/planning#attendance",
    );
    const summary = screen.getByText("Offener Handlungsbedarf", { selector: "dt" });
    expect(summary.nextElementSibling).toHaveTextContent("1");
    expect(
      within(screen.getByRole("region", { name: "Handlungsbedarf" })).getAllByText("Mia Muster"),
    ).toHaveLength(2);
    expect(
      within(screen.getByRole("region", { name: "Bevorstehende Einsätze" })).getAllByText(
        "Nina Zukunft",
      ),
    ).toHaveLength(2);
    expect(
      within(screen.getByRole("region", { name: "Abgeschlossene Einträge" })).getAllByText(
        "Leo Beispiel",
      ),
    ).toHaveLength(2);
  });

  it("provides accessible filters and desktop/mobile responsive list semantics", async () => {
    renderPanel();
    await screen.findByText("Offener Handlungsbedarf");
    const search = screen.getByRole("searchbox", { name: "Einträge suchen" });
    const filter = screen.getByRole("combobox", { name: "Status filtern" });
    expect(search).toHaveClass("min-h-11");
    expect(filter).toHaveClass("min-h-11");
    fireEvent.change(search, { target: { value: "Zukunft" } });
    expect(screen.queryByText("Mia Muster")).not.toBeInTheDocument();
    expect(screen.getAllByText("Nina Zukunft")).toHaveLength(2);
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.change(filter, { target: { value: "ATTENDED" } });
    expect(screen.getAllByText("Leo Beispiel")).toHaveLength(2);
    expect(screen.queryByText("Nina Zukunft")).not.toBeInTheDocument();
    expect(screen.getAllByRole("table")[0]?.parentElement).toHaveClass("hidden", "md:block");
    expect(screen.getAllByRole("list", { name: "Anwesenheitseinträge" })[0]).toHaveClass(
      "md:hidden",
    );
  });

  it("offers all outcomes and confirms no-show in an accessible dialog", async () => {
    const fetchMock = renderPanel();
    const controls = await screen.findAllByRole("combobox", { name: /Anwesenheit von Mia Muster/ });
    expect(
      within(controls[0]!)
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual([
      "OPEN",
      "ATTENDED",
      "EXCUSED_CANCELLED",
      "LATE_CANCELLED",
      "NO_SHOW",
      "SUBSTITUTE_ORGANIZED",
    ]);
    expect(controls[0]).toHaveClass("min-h-11");
    fireEvent.change(controls[0]!, { target: { value: "NO_SHOW" } });
    const dialog = screen.getByRole("dialog", { name: "Als nicht erschienen markieren?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText(/Mia Muster/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Nicht erschienen" });
    const cancel = within(dialog).getByRole("button", { name: "Abbrechen" });
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveClass("min-h-11");
    fireEvent.keyDown(window, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).includes("/attendance") && init?.method === "PATCH",
      ),
    ).toBe(false);

    fireEvent.change(controls[0]!, { target: { value: "NO_SHOW" } });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(controls[0]).toHaveValue("OPEN");

    fireEvent.change(controls[0]!, { target: { value: "NO_SHOW" } });
    fireEvent.click(screen.getByRole("button", { name: "Nicht erschienen" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nicht erschienen");
    await waitFor(() =>
      expect(
        screen.getAllByRole("combobox", { name: /Anwesenheit von Mia Muster/ })[0],
      ).toHaveValue("NO_SHOW"),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).includes("/attendance") && init?.method === "PATCH",
      ),
    ).toHaveLength(1);
  });

  it("renders empty, load-error, and mutation-error feedback", async () => {
    renderPanel(attendanceFetch({ empty: true }));
    expect(
      await screen.findByText("Es sind noch keine Eintragungen für Anwesenheiten vorhanden."),
    ).toBeInTheDocument();
    cleanup();
    renderPanel(attendanceFetch({ fail: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vereinsjahre konnten nicht geladen",
    );
    cleanup();
    renderPanel(attendanceFetch({ mutationFails: true }));
    const controls = await screen.findAllByRole("combobox", { name: /Anwesenheit von Mia Muster/ });
    fireEvent.change(controls[0]!, { target: { value: "ATTENDED" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Anwesenheit konnte nicht gespeichert",
    );
    expect(controls[0]).toHaveValue("OPEN");
  });
});
