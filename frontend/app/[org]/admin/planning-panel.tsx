"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  cancelSignup,
  createEvent,
  createShift,
  deleteEvent,
  loadShiftCrewSuggestion,
  updateEventStatus,
  updateShiftStatus,
  updateSignupAttendance,
  type AdminSignup,
  type EventStatus,
  type MenuType,
  type PlanningEvent,
  type Season,
  type Shift,
  type ShiftCrewSuggestion,
  type ShiftStatus,
  type SignupOutcome,
} from "@/lib/planning";
import { loadAdminPlanningData } from "@/lib/admin-planning-data";

const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  POSTPONED: "Verschoben",
  CANCELLED: "Abgesagt",
  COMPLETED: "Erledigt",
};
const menuTypeLabels: Record<MenuType, string> = {
  FRIES_NUGGETS: "Pommes/Chicken Nuggets",
  FRIES_NUGGETS_BURGER: "Pommes/Chicken Nuggets + Burger",
};
const shiftStatusLabels: Record<ShiftStatus, string> = {
  OPEN: "Offen",
  CLOSED: "Geschlossen",
  CANCELLED: "Abgesagt",
};
const attendanceLabels: Record<SignupOutcome, string> = {
  OPEN: "Noch offen",
  ATTENDED: "Anwesend",
  EXCUSED_CANCELLED: "Entschuldigt",
  LATE_CANCELLED: "Kurzfristig abgesagt",
  NO_SHOW: "Nicht erschienen",
  SUBSTITUTE_ORGANIZED: "Ersatz organisiert",
};
const attendanceOutcomes: readonly SignupOutcome[] = [
  "OPEN",
  "ATTENDED",
  "EXCUSED_CANCELLED",
  "LATE_CANCELLED",
  "NO_SHOW",
  "SUBSTITUTE_ORGANIZED",
];
const eventStatusVariants: Record<EventStatus, BadgeProps["variant"]> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  POSTPONED: "warning",
  CANCELLED: "error",
  COMPLETED: "success",
};
const shiftStatusVariants: Record<ShiftStatus, BadgeProps["variant"]> = {
  OPEN: "success",
  CLOSED: "neutral",
  CANCELLED: "error",
};
const eventActions: Record<EventStatus, EventStatus[]> = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["POSTPONED", "COMPLETED", "CANCELLED"],
  POSTPONED: ["PUBLISHED", "CANCELLED"],
  CANCELLED: ["DRAFT"],
  COMPLETED: ["DRAFT"],
};
const eventActionLabels: Partial<Record<EventStatus, string>> = {
  PUBLISHED: "Veröffentlichen",
  POSTPONED: "Verschieben",
  CANCELLED: "Absagen",
  COMPLETED: "Erledigen",
  DRAFT: "Wiedereröffnen",
};
const shiftActions: Record<ShiftStatus, ShiftStatus[]> = {
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: ["OPEN"],
  CANCELLED: [],
};
const shiftActionLabels: Record<ShiftStatus, string> = {
  OPEN: "Öffnen",
  CLOSED: "Schliessen",
  CANCELLED: "Absagen",
};
const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function serviceBadge(shifts: Shift[], type: Shift["shift_type"]) {
  const active = shifts.filter(
    (shift) => shift.shift_type === type && shift.status !== "CANCELLED",
  );
  if (active.length === 0)
    return {
      label: type === "KIOSK" ? "Kiosk nicht vorgesehen" : "Grill nicht vorgesehen",
      variant: "neutral" as const,
    };
  const required = active.reduce((sum, shift) => sum + shift.required_volunteers, 0);
  const occupied = active.reduce((sum, shift) => sum + shift.occupied_volunteers, 0);
  if (occupied >= required && required > 0)
    return {
      label: type === "KIOSK" ? "Kiosk besetzt" : "Grill besetzt",
      variant: "success" as const,
    };
  if (occupied > 0)
    return {
      label: type === "KIOSK" ? "Kiosk unterbesetzt" : "Grill unterbesetzt",
      variant: "error" as const,
    };
  return { label: type === "KIOSK" ? "Kiosk offen" : "Grill offen", variant: "warning" as const };
}

function eventDateTile(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("de-CH", { weekday: "short", timeZone: "UTC" }).format(date),
    day: new Intl.DateTimeFormat("de-CH", { day: "2-digit", timeZone: "UTC" }).format(date),
    month: new Intl.DateTimeFormat("de-CH", { month: "short", timeZone: "UTC" }).format(date),
  };
}

function calendarWeek(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return {
    key: start,
    label: `${formatDate(start)} – ${formatDate(date.toISOString().slice(0, 10))}`,
  };
}

function closestLoadedWeek(weeks: ReadonlyArray<{ key: string }>, timezone: string) {
  const todayParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const todayUtc = Date.UTC(todayParts.year!, todayParts.month! - 1, todayParts.day!);
  return weeks.reduce((closest, week) => {
    const distance = Math.abs(Date.parse(`${week.key}T00:00:00Z`) - todayUtc);
    const closestDistance = Math.abs(Date.parse(`${closest.key}T00:00:00Z`) - todayUtc);
    return distance < closestDistance ? week : closest;
  }).key;
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function organizationDateTimeToIso(value: string, timezone: string) {
  const [datePart, timePart] = value.split("T");
  const dateValues = datePart!.split("-").map(Number);
  const timeValues = timePart!.split(":").map(Number);
  const year = dateValues[0]!;
  const month = dateValues[1]!;
  const day = dateValues[2]!;
  const hour = timeValues[0]!;
  const minute = timeValues[1]!;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!,
    );
    instant += target - represented;
  }
  return new Date(instant).toISOString();
}

export function PlanningPanel({ org, timezone }: Readonly<{ org: string; timezone: string }>) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<PlanningEvent[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [eventView, setEventView] = useState<"agenda" | "calendar">("agenda");
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const requestId = useRef(0);
  const selectedCalendarWeek = useRef<HTMLHeadingElement | null>(null);

  const activeSeasons = useMemo(
    () => seasons.filter((season) => season.status !== "CLOSED" && season.status !== "ARCHIVED"),
    [seasons],
  );
  const filteredEvents = useMemo(() => {
    const activeIds = new Set(activeSeasons.map((season) => season.id));
    const query = search.trim().toLocaleLowerCase("de-CH");
    return events.filter((event) => {
      const haystack = [event.title, event.public_description, event.internal_note]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-CH");
      return (
        activeIds.has(event.season_id) &&
        (!dateFrom || event.date >= dateFrom) &&
        (!dateTo || event.date <= dateTo) &&
        (!seasonFilter || event.season_id === seasonFilter) &&
        (!venueFilter || event.location === venueFilter) &&
        (!typeFilter || event.event_type === typeFilter) &&
        (!statusFilter || event.status === statusFilter) &&
        (!query || haystack.includes(query))
      );
    });
  }, [
    activeSeasons,
    dateFrom,
    dateTo,
    events,
    search,
    seasonFilter,
    statusFilter,
    typeFilter,
    venueFilter,
  ]);
  const dailySummaries = useMemo(() => {
    const groups = new Map<string, PlanningEvent[]>();
    filteredEvents.forEach((event) =>
      groups.set(event.date, [...(groups.get(event.date) ?? []), event]),
    );
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [filteredEvents]);

  const loadedWeeks = useMemo(() => {
    const weeks = new Map<string, ReturnType<typeof calendarWeek>>();
    filteredEvents.forEach((event) => {
      const week = calendarWeek(event.date);
      weeks.set(week.key, week);
    });
    return [...weeks.values()].sort((left, right) => left.key.localeCompare(right.key));
  }, [filteredEvents]);

  useEffect(() => {
    if (loadedWeeks.length === 0) {
      setSelectedWeek(null);
      return;
    }
    setSelectedWeek((current) =>
      current && loadedWeeks.some((week) => week.key === current)
        ? current
        : closestLoadedWeek(loadedWeeks, timezone),
    );
  }, [loadedWeeks, timezone]);

  const selectedWeekIndex = loadedWeeks.findIndex((week) => week.key === selectedWeek);
  const selectedWeekLabel = loadedWeeks[selectedWeekIndex]?.label;

  useEffect(() => {
    if (eventView === "calendar") selectedCalendarWeek.current?.focus();
  }, [eventView, selectedWeek]);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError(null);
    try {
      const data = await loadAdminPlanningData(org, (planning) => {
        if (currentRequest !== requestId.current) return;
        setSeasons(planning.seasons);
      });
      if (currentRequest !== requestId.current) return;
      setEvents(data.events);
      setShifts(data.shifts);
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Planungsdaten konnten nicht geladen werden.",
      );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    setLoading(true);
    setSeasons([]);
    setEvents([]);
    setShifts([]);
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  async function run(operation: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      setSuccess(message);
      await refresh();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Änderung konnte nicht gespeichert werden.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await run(
      () =>
        createEvent(org, String(data.get("season_id")), {
          title: String(data.get("title")),
          date: String(data.get("date")),
          location: String(data.get("location")),
          event_type: String(data.get("event_type")),
          public_description: String(data.get("public_description")) || null,
          internal_note: String(data.get("internal_note")) || null,
          ...(String(data.get("kickoff_time"))
            ? { kickoff_time: String(data.get("kickoff_time")) }
            : {}),
          status: "DRAFT",
        }),
      "Anlass wurde erstellt.",
    );
    if (created) form.reset();
  }

  async function submitShift(event: FormEvent<HTMLFormElement>, eventId: string): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const menuType = String(data.get("menu_type") ?? "");
    const created = await run(
      () =>
        createShift(org, eventId, {
          starts_at: organizationDateTimeToIso(String(data.get("starts_at")), timezone),
          ends_at: organizationDateTimeToIso(String(data.get("ends_at")), timezone),
          required_volunteers: Number(data.get("required_volunteers")),
          public_note: String(data.get("public_note")) || null,
          internal_note: String(data.get("internal_note")) || null,
          status: "OPEN",
          sort_order: 0,
          shift_type: "GRILL",
          assignment_mode: "OPEN_SIGNUP",
          menu_type: menuType ? (menuType as MenuType) : null,
        }),
      "Einsatz wurde erstellt.",
    );
    if (created) form.reset();
    return created;
  }

  function changeEventStatus(planningEvent: PlanningEvent, next: EventStatus) {
    if (
      (next === "CANCELLED" || next === "COMPLETED") &&
      !window.confirm(
        `Anlass "${planningEvent.title}" wirklich als ${eventStatusLabels[next].toLocaleLowerCase("de-CH")} markieren?`,
      )
    )
      return;
    void run(
      () => updateEventStatus(org, planningEvent.id, next),
      "Anlassstatus wurde aktualisiert.",
    );
  }

  function removeHistoricalEvent(planningEvent: PlanningEvent) {
    if (!window.confirm(`Anlass "${planningEvent.title}" endgültig löschen?`)) return;
    void run(() => deleteEvent(org, planningEvent.id), "Der Anlass wurde endgültig gelöscht.");
  }

  function changeShiftStatus(shift: Shift, eventTitle: string, next: ShiftStatus) {
    if (next === "CANCELLED" && !window.confirm(`Einsatz für "${eventTitle}" wirklich absagen?`))
      return;
    void run(() => updateShiftStatus(org, shift.id, next), "Einsatzstatus wurde aktualisiert.");
  }

  function cancelVolunteerSignup(signup: AdminSignup) {
    if (
      !window.confirm(
        `Möchtest du die Eintragung von ${signup.public_name} wirklich absagen? Der Platz wird danach wieder frei.`,
      )
    )
      return;
    void run(
      () => cancelSignup(org, signup.id),
      `Die Eintragung von ${signup.public_name} wurde abgesagt.`,
    );
  }

  function changeAttendance(signup: AdminSignup, outcome: SignupOutcome): boolean {
    if (
      outcome === "NO_SHOW" &&
      !window.confirm(`${signup.public_name} wirklich als nicht erschienen markieren?`)
    )
      return false;
    void run(
      () => updateSignupAttendance(org, signup.id, outcome),
      `Anwesenheit von ${signup.public_name} wurde auf „${attendanceLabels[outcome]}“ gesetzt.`,
    );
    return true;
  }

  function keepPersistedAttendance(signup: AdminSignup) {
    setShifts((current) =>
      current.map((shift) => ({
        ...shift,
        signups: shift.signups.map((item) => (item.id === signup.id ? { ...signup } : item)),
      })),
    );
  }

  const now = new Date();
  const unresolvedItems = loading
    ? []
    : shifts.flatMap((shift) => {
        if (new Date(shift.ends_at) > now) return [];
        return shift.signups
          .filter((signup) => signup.outcome === "OPEN")
          .map((signup) => ({
            signup,
            shift,
            event: events.find((e) => e.id === shift.event_id),
          }));
      });

  if (loading)
    return (
      <section aria-live="polite">
        <p>Planung wird geladen …</p>
      </section>
    );
  return (
    <section className="grid gap-7" aria-labelledby="planning-title">
      <PageHeader
        headingId="planning-title"
        title="Planung"
        description="Spiele, Einsätze und freie Plätze aus den vorhandenen Planungsdaten steuern."
      />
      {error ? (
        <p role="alert" className="rounded-md border border-status-error p-3 text-status-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="rounded-md border border-status-success p-3 text-status-success"
        >
          {success}
        </p>
      ) : null}
      <section className="scroll-mt-4" id="attendance" aria-labelledby="handlungsbedarf-title">
        <Card
          className={unresolvedItems.length > 0 ? "border-status-error/30" : "border-border/70"}
        >
          <CardBody className="p-4 md:p-5">
            <h2 id="handlungsbedarf-title" className="text-lg font-semibold">
              Handlungsbedarf Anwesenheit
              {unresolvedItems.length > 0 ? (
                <Badge
                  className="ml-2 min-w-6 justify-center"
                  variant="error"
                  aria-label={`${unresolvedItems.length} ${unresolvedItems.length === 1 ? "offene Eintragung" : "offene Eintragungen"}`}
                >
                  {unresolvedItems.length}
                </Badge>
              ) : null}
            </h2>
            {unresolvedItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Alle vergangenen Einsätze sind abgeschlossen. Kein Handlungsbedarf.
              </p>
            ) : (
              <ul
                className="mt-3 grid gap-3"
                aria-label="Offene Anwesenheiten vergangener Einsätze"
              >
                {unresolvedItems.map(({ signup, shift: itemShift, event: itemEvent }) => (
                  <li
                    key={signup.id}
                    className="flex flex-col gap-2 rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium">{signup.public_name}</span>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {itemEvent ? itemEvent.title : "Unbekannter Anlass"} ·{" "}
                        {formatDateTime(itemShift.starts_at, timezone)} –{" "}
                        {formatDateTime(itemShift.ends_at, timezone)}
                      </p>
                    </div>
                    <label className="grid gap-1 text-xs font-medium">
                      <span>Anwesenheit erfassen</span>
                      <select
                        className="min-h-11 rounded-md border bg-background px-3 py-1"
                        value=""
                        disabled={busy}
                        aria-label={`Anwesenheit von ${signup.public_name} im Einsatz ${formatDateTime(itemShift.starts_at, timezone)} für ${itemEvent ? itemEvent.title : "Unbekannter Anlass"} erfassen`}
                        onChange={(changeEvent) => {
                          const outcome = changeEvent.target.value;
                          if (!outcome) return;
                          if (!changeAttendance(signup, outcome as SignupOutcome))
                            keepPersistedAttendance(signup);
                        }}
                      >
                        <option value="" disabled hidden>
                          Bitte wählen
                        </option>
                        {attendanceOutcomes
                          .filter((outcome) => outcome !== "OPEN")
                          .map((outcome) => (
                            <option key={outcome} value={outcome}>
                              {attendanceLabels[outcome]}
                            </option>
                          ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
      <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:gap-9">
        <section className="grid min-w-0 gap-5" aria-labelledby="events-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="events-title" className="text-xl font-semibold">
                {eventView === "agenda" ? "Agenda" : "Kalender"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Anlässe nach Saison planen und die benötigten Einsätze erfassen.
              </p>
            </div>
            <div
              className="inline-flex rounded-md border border-border bg-background p-1"
              role="group"
              aria-label="Planungsansicht"
            >
              <Button
                className="min-h-11"
                type="button"
                variant={eventView === "agenda" ? "primary" : "ghost"}
                aria-pressed={eventView === "agenda"}
                onClick={() => setEventView("agenda")}
              >
                Agenda
              </Button>
              <Button
                className="min-h-11"
                type="button"
                variant={eventView === "calendar" ? "primary" : "ghost"}
                aria-pressed={eventView === "calendar"}
                onClick={() => setEventView("calendar")}
              >
                Kalender
              </Button>
            </div>
          </div>
          <section
            className="grid gap-3 rounded-lg border border-border/80 bg-background p-4"
            aria-labelledby="spielbetrieb-filter-title"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="spielbetrieb-filter-title" className="font-semibold">
                Spielbetrieb filtern
              </h3>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {filteredEvents.length} Spiele
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label>
                Von
                <input
                  className={control}
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label>
                Bis
                <input
                  className={control}
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
              <label>
                Saison
                <select
                  className={control}
                  value={seasonFilter}
                  onChange={(event) => setSeasonFilter(event.target.value)}
                >
                  <option value="">Alle</option>
                  {activeSeasons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Spielort
                <select
                  className={control}
                  value={venueFilter}
                  onChange={(event) => setVenueFilter(event.target.value)}
                >
                  <option value="">Alle</option>
                  {[
                    ...new Set(
                      filteredEvents
                        .concat(
                          events.filter((item) =>
                            activeSeasons.some((season) => season.id === item.season_id),
                          ),
                        )
                        .map((item) => item.location),
                    ),
                  ]
                    .sort()
                    .map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                </select>
              </label>
              <label>
                SpielTyp
                <select
                  className={control}
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                >
                  <option value="">Alle</option>
                  {[
                    ...new Set(
                      events
                        .filter((item) =>
                          activeSeasons.some((season) => season.id === item.season_id),
                        )
                        .map((item) => item.event_type),
                    ),
                  ]
                    .sort()
                    .map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                </select>
              </label>
              <label>
                Status
                <select
                  className={control}
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="">Alle</option>
                  {Object.entries(eventStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      Status: {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                Suche
                <input
                  className={control}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Teams, Titel oder Bemerkung"
                />
              </label>
            </div>
            <Button
              className="w-fit"
              variant="secondary"
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setSeasonFilter("");
                setVenueFilter("");
                setTypeFilter("");
                setStatusFilter("");
                setSearch("");
              }}
            >
              Filter zurücksetzen
            </Button>
          </section>
          {dailySummaries.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Tagesübersichten">
              {dailySummaries.map(([date, dayEvents]) => {
                const dayShifts = shifts.filter((shift) =>
                  dayEvents.some((event) => event.id === shift.event_id),
                );
                const venues = new Set(dayEvents.map((event) => event.location));
                const open = dayShifts.some((shift) => shift.status === "OPEN");
                return (
                  <Card key={date}>
                    <CardBody>
                      <h3 className="font-semibold">{formatDate(date)}</h3>
                      <p className="mt-1 text-sm">
                        {dayEvents.length} {dayEvents.length === 1 ? "Spiel" : "Spiele"} ·{" "}
                        {venues.size} {venues.size === 1 ? "Ort" : "Orte"}
                      </p>
                      <Badge className="mt-2" variant={open ? "success" : "neutral"}>
                        {dayShifts.length === 0
                          ? "Keine Einsätze"
                          : open
                            ? "Tagesstatus: Offen"
                            : "Tagesstatus: Geschlossen"}
                      </Badge>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border p-4 text-muted-foreground">
              Keine Spiele entsprechen den gewählten Filtern.
            </p>
          )}
          {loadedWeeks.length > 0 ? (
            <nav
              className="flex w-full flex-col gap-2 rounded-lg border border-border/80 bg-background p-2 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Datumsnavigation"
            >
              <p className="px-1 text-sm font-medium" aria-live="polite">
                <span className="sr-only">Ausgewähltes Zeitfenster: </span>
                {selectedWeekLabel}
              </p>
              <div
                className="grid w-full grid-cols-3 gap-1 sm:w-auto"
                role="group"
                aria-label="Zeitfenster"
              >
                <Button
                  className="min-h-11 px-3"
                  type="button"
                  variant="ghost"
                  disabled={selectedWeekIndex <= 0}
                  onClick={() => setSelectedWeek(loadedWeeks[selectedWeekIndex - 1]!.key)}
                >
                  Zurück
                </Button>
                <Button
                  className="min-h-11 px-3"
                  type="button"
                  variant="ghost"
                  disabled={selectedWeek === closestLoadedWeek(loadedWeeks, timezone)}
                  onClick={() => setSelectedWeek(closestLoadedWeek(loadedWeeks, timezone))}
                >
                  Aktuell
                </Button>
                <Button
                  className="min-h-11 px-3"
                  type="button"
                  variant="ghost"
                  disabled={selectedWeekIndex < 0 || selectedWeekIndex >= loadedWeeks.length - 1}
                  onClick={() => setSelectedWeek(loadedWeeks[selectedWeekIndex + 1]!.key)}
                >
                  Weiter
                </Button>
              </div>
            </nav>
          ) : null}
          <details className="rounded-lg border border-border/80 bg-background p-4 shadow-card">
            <summary className="min-h-11 cursor-pointer font-medium">Anlass erstellen</summary>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={submitEvent}>
              <label htmlFor="create-event-season">
                Anlass-Saison
                <select
                  className={control}
                  id="create-event-season"
                  name="season_id"
                  required
                  disabled={seasons.length === 0}
                >
                  <option value="">Bitte wählen</option>
                  {activeSeasons.map((season) => (
                    <option
                      key={season.id}
                      value={season.id}
                      disabled={season.status === "CLOSED" || season.status === "ARCHIVED"}
                    >
                      {season.name}
                      {season.status === "CLOSED"
                        ? " (geschlossen)"
                        : season.status === "ARCHIVED"
                          ? " (archiviert)"
                          : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="create-event-title">
                Anlasstitel
                <input className={control} id="create-event-title" name="title" required />
              </label>
              <label htmlFor="create-event-date">
                Anlassdatum
                <input
                  className={control}
                  id="create-event-date"
                  name="date"
                  type="date"
                  required
                />
              </label>
              <label htmlFor="create-event-location">
                Ort
                <input className={control} id="create-event-location" name="location" required />
              </label>
              <label htmlFor="create-event-kickoff-time">
                Anspielzeit
                <input
                  className={control}
                  id="create-event-kickoff-time"
                  name="kickoff_time"
                  type="time"
                />
              </label>
              <label htmlFor="create-event-type">
                Anlassart
                <input
                  className={control}
                  id="create-event-type"
                  name="event_type"
                  placeholder="z. B. Heimspiel"
                  required
                />
              </label>
              <label htmlFor="create-event-public-description">
                Öffentliche Beschreibung
                <textarea
                  className={control}
                  id="create-event-public-description"
                  name="public_description"
                />
              </label>
              <label htmlFor="create-event-internal-note">
                Interne Notiz
                <textarea
                  className={control}
                  id="create-event-internal-note"
                  name="internal_note"
                />
              </label>
              <fieldset className="grid gap-2 rounded-md border border-dashed p-3 sm:col-span-2">
                <legend className="px-1 text-sm font-medium">Betriebshinweise (optional)</legend>
                <p className="text-xs text-muted-foreground">
                  Leer lassen, damit Kiosk und Grill automatisch aus dem Spieltag vorgeschlagen
                  werden.
                </p>
                <div className="flex flex-wrap gap-5">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input className="size-5" name="kiosk_requested" type="checkbox" />
                    Kiosk vorsehen
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input className="size-5" name="grill_requested" type="checkbox" />
                    Grill vorsehen
                  </label>
                </div>
              </fieldset>
              <Button className="sm:self-end" disabled={busy || seasons.length === 0} type="submit">
                Anlass erstellen
              </Button>
            </form>
          </details>
          {activeSeasons.length === 0 ? (
            <p className="text-muted-foreground">
              Erstellen Sie zuerst eine Saison, bevor Sie Anlässe planen.
            </p>
          ) : (
            activeSeasons.map((season) => {
              const seasonEvents = filteredEvents
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.season_id === season.id)
                .sort(
                  (left, right) =>
                    left.item.date.localeCompare(right.item.date) || left.index - right.index,
                )
                .map(({ item }) => item);
              const visibleSeasonEvents =
                eventView === "agenda"
                  ? seasonEvents.filter((item) => calendarWeek(item.date).key === selectedWeek)
                  : seasonEvents;
              return (
                <section
                  className="grid gap-3"
                  key={season.id}
                  aria-labelledby={`events-${season.id}`}
                >
                  <h4 id={`events-${season.id}`} className="font-semibold">
                    {season.name}
                  </h4>
                  {seasonEvents.length === 0 ? (
                    <p className="text-muted-foreground">
                      In dieser Saison sind noch keine Anlässe vorhanden.
                    </p>
                  ) : visibleSeasonEvents.length === 0 ? (
                    <p className="rounded-md border border-border/80 p-4 text-muted-foreground">
                      In dieser Saison gibt es in der ausgewählten Woche keine Anlässe.
                    </p>
                  ) : (
                    <ul
                      className={
                        eventView === "calendar" ? "grid gap-4 md:grid-cols-2" : "grid gap-4"
                      }
                      aria-label={
                        eventView === "calendar"
                          ? `Kalenderwochen ${season.name}`
                          : `Agenda ${season.name}`
                      }
                    >
                      {visibleSeasonEvents.map((planningEvent, eventIndex) => {
                        const eventShifts = shifts.filter(
                          (shift) => shift.event_id === planningEvent.id,
                        );
                        const dateTile = eventDateTile(planningEvent.date);
                        const week = calendarWeek(planningEvent.date);
                        const previousWeek =
                          eventIndex > 0
                            ? calendarWeek(visibleSeasonEvents[eventIndex - 1]!.date).key
                            : null;
                        return [
                          eventView === "calendar" && week.key !== previousWeek ? (
                            <li className="md:col-span-2" key={`week-${week.key}`}>
                              <h5
                                className={
                                  week.key === selectedWeek
                                    ? "rounded-md border border-primary/30 bg-primary/10 p-3 font-semibold text-primary outline-none ring-2 ring-primary/30"
                                    : "border-b border-border/80 pb-2 font-semibold"
                                }
                                aria-current={week.key === selectedWeek ? "date" : undefined}
                                ref={week.key === selectedWeek ? selectedCalendarWeek : undefined}
                                tabIndex={week.key === selectedWeek ? -1 : undefined}
                              >
                                Woche {week.label}
                              </h5>
                            </li>
                          ) : null,
                          <li key={planningEvent.id}>
                            <Card className="overflow-hidden border-border/80 transition-shadow hover:shadow-md">
                              <details className="group">
                                <summary
                                  className="min-h-11 cursor-pointer list-none p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
                                  aria-label={`Anlass ${planningEvent.title} am ${formatDate(planningEvent.date)} anzeigen`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex min-w-0 gap-3">
                                      <time
                                        aria-hidden="true"
                                        className="grid h-16 w-14 shrink-0 place-content-center rounded-md border border-primary/25 bg-primary/10 text-center text-primary shadow-sm"
                                        dateTime={planningEvent.date}
                                      >
                                        <span className="text-[0.65rem] font-semibold uppercase leading-none">
                                          {dateTile.weekday}
                                        </span>
                                        <span className="text-xl font-bold leading-tight">
                                          {dateTile.day}
                                        </span>
                                        <span className="text-[0.65rem] font-semibold uppercase leading-none">
                                          {dateTile.month}
                                        </span>
                                      </time>
                                      <div className="min-w-0">
                                        <p className="font-semibold">{planningEvent.title}</p>
                                        <p className="mt-1 text-sm">
                                          {formatDate(planningEvent.date)}
                                          {planningEvent.kickoff_time
                                            ? ` · ${planningEvent.kickoff_time.slice(0, 5)}`
                                            : ""}{" "}
                                          · {planningEvent.location}
                                        </p>
                                        {(() => {
                                          const kiosk = serviceBadge(eventShifts, "KIOSK");
                                          const grill = serviceBadge(eventShifts, "GRILL");
                                          return (
                                            <>
                                              <Badge className="mt-2 mr-2" variant={kiosk.variant}>
                                                {kiosk.label}
                                              </Badge>
                                              <Badge className="mt-2 mr-2" variant={grill.variant}>
                                                {grill.label}
                                              </Badge>
                                            </>
                                          );
                                        })()}
                                        {!planningEvent.source_import_id ? (
                                          <Badge className="mt-2 mr-2" variant="neutral">
                                            Manuell
                                          </Badge>
                                        ) : null}
                                        <Badge className="mt-2" variant="neutral">
                                          {eventShifts.length}{" "}
                                          {eventShifts.length === 1 ? "Einsatz" : "Einsätze"} ·{" "}
                                          {eventShifts.reduce(
                                            (sum, item) => sum + item.occupied_volunteers,
                                            0,
                                          )}{" "}
                                          von{" "}
                                          {eventShifts.reduce(
                                            (sum, item) => sum + item.required_volunteers,
                                            0,
                                          )}{" "}
                                          Plätzen belegt
                                        </Badge>
                                      </div>
                                    </div>
                                    <Badge variant={eventStatusVariants[planningEvent.status]}>
                                      {eventStatusLabels[planningEvent.status]}
                                    </Badge>
                                  </div>
                                </summary>
                                <div className="border-t p-4">
                                  <p className="text-sm text-muted-foreground">
                                    {planningEvent.event_type}
                                  </p>
                                  {planningEvent.public_description ? (
                                    <p className="mt-2 text-sm">
                                      {planningEvent.public_description}
                                    </p>
                                  ) : null}
                                  {planningEvent.internal_note ? (
                                    <p className="mt-2 text-sm">
                                      Bemerkung: {planningEvent.internal_note}
                                    </p>
                                  ) : null}
                                  {eventActions[planningEvent.status].length ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {eventActions[planningEvent.status].map((next) => (
                                        <Button
                                          variant={
                                            next === "CANCELLED" ? "destructive" : "secondary"
                                          }
                                          disabled={busy}
                                          key={next}
                                          aria-label={`Anlass ${planningEvent.title} ${eventActionLabels[next]?.toLocaleLowerCase("de-CH")}`}
                                          onClick={() => changeEventStatus(planningEvent, next)}
                                        >
                                          {eventActionLabels[next]}
                                        </Button>
                                      ))}
                                    </div>
                                  ) : null}
                                  {planningEvent.status === "CANCELLED" ||
                                  planningEvent.status === "COMPLETED" ? (
                                    <Button
                                      className="mt-3"
                                      variant="destructive"
                                      onClick={() => removeHistoricalEvent(planningEvent)}
                                      disabled={busy}
                                    >
                                      Anlass löschen
                                    </Button>
                                  ) : null}
                                  <div className="mt-4 grid gap-3">
                                    <h6 className="font-semibold">Einsätze</h6>
                                    {eventShifts.length === 0 ? (
                                      <p className="text-muted-foreground">
                                        Für diesen Anlass sind noch keine Einsätze vorhanden.
                                      </p>
                                    ) : (
                                      <ul className="grid gap-3">
                                        {eventShifts.map((shift) => (
                                          <li key={shift.id}>
                                            <Card className="shadow-none">
                                              <CardBody className="p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                  <div>
                                                    <p className="font-medium">
                                                      {formatDateTime(shift.starts_at, timezone)} –{" "}
                                                      {formatDateTime(shift.ends_at, timezone)}
                                                    </p>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                      <Badge variant="neutral">
                                                        {shift.occupied_volunteers} von{" "}
                                                        {shift.required_volunteers} belegt
                                                      </Badge>
                                                      {shift.menu_type ? (
                                                        <Badge variant="success">
                                                          {menuTypeLabels[shift.menu_type]}
                                                        </Badge>
                                                      ) : null}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                      {shift.open_places === 0
                                                        ? "Vollständig besetzt"
                                                        : shift.open_places === 1
                                                          ? "1 Platz offen"
                                                          : `${shift.open_places} Plätze offen`}
                                                    </p>
                                                  </div>
                                                  <Badge
                                                    variant={shiftStatusVariants[shift.status]}
                                                  >
                                                    {shiftStatusLabels[shift.status]}
                                                  </Badge>
                                                </div>
                                                {shift.public_note ? (
                                                  <p className="mt-2 text-sm">
                                                    Öffentlich: {shift.public_note}
                                                  </p>
                                                ) : null}
                                                {shift.internal_note ? (
                                                  <p className="mt-1 text-sm text-muted-foreground">
                                                    Intern: {shift.internal_note}
                                                  </p>
                                                ) : null}
                                                <div className="mt-3 border-t pt-3">
                                                  <p className="text-sm font-medium">
                                                    Eingetragene Helfende
                                                  </p>
                                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                                    Teilnahmestatus erfassen (keine automatische
                                                    Stunden- oder Auszahlungsbuchung).
                                                  </p>
                                                  {shift.signups.length === 0 ? (
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                      Noch niemand eingetragen.
                                                    </p>
                                                  ) : (
                                                    <ul className="mt-2 grid gap-2">
                                                      {shift.signups.map((signup) => (
                                                        <li
                                                          className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                                                          key={signup.id}
                                                        >
                                                          <span className="font-medium">
                                                            {signup.public_name}
                                                          </span>
                                                          <div className="flex flex-wrap items-center gap-2">
                                                            <label className="grid gap-1 text-xs font-medium">
                                                              <span>Anwesenheit</span>
                                                              <select
                                                                className="min-h-11 rounded-md border bg-background px-3 py-1"
                                                                value={signup.outcome}
                                                                disabled={busy}
                                                                aria-label={`Anwesenheit von ${signup.public_name} im Einsatz ${formatDateTime(shift.starts_at, timezone)} für ${planningEvent.title}`}
                                                                onChange={(event) => {
                                                                  if (
                                                                    !changeAttendance(
                                                                      signup,
                                                                      event.target
                                                                        .value as SignupOutcome,
                                                                    )
                                                                  )
                                                                    keepPersistedAttendance(signup);
                                                                }}
                                                              >
                                                                {attendanceOutcomes.map(
                                                                  (outcome) => (
                                                                    <option
                                                                      key={outcome}
                                                                      value={outcome}
                                                                    >
                                                                      {attendanceLabels[outcome]}
                                                                    </option>
                                                                  ),
                                                                )}
                                                              </select>
                                                            </label>
                                                            <a
                                                              className="inline-flex min-h-11 items-center rounded-md border bg-background px-3 py-1 text-xs font-medium underline transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                              href={`tel:${signup.phone}`}
                                                              aria-label={`Telefonnummer von ${signup.public_name} anrufen: ${signup.phone}`}
                                                            >
                                                              {signup.phone}
                                                            </a>
                                                            <a
                                                              className="inline-flex min-h-11 items-center break-all rounded-md border bg-background px-3 py-1 text-xs font-medium underline transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                              href={`mailto:${signup.email}`}
                                                              aria-label={`E-Mail an ${signup.public_name} senden: ${signup.email}`}
                                                            >
                                                              {signup.email}
                                                            </a>
                                                            <Button
                                                              size="sm"
                                                              variant="destructive"
                                                              disabled={busy}
                                                              aria-label={`Eintragung von ${signup.public_name} absagen`}
                                                              onClick={() =>
                                                                cancelVolunteerSignup(signup)
                                                              }
                                                            >
                                                              Eintragung absagen
                                                            </Button>
                                                          </div>
                                                        </li>
                                                      ))}
                                                    </ul>
                                                  )}
                                                </div>
                                                {shiftActions[shift.status].length ? (
                                                  <div className="mt-3 flex flex-wrap gap-2">
                                                    {shiftActions[shift.status].map((next) => (
                                                      <Button
                                                        variant={
                                                          next === "CANCELLED"
                                                            ? "destructive"
                                                            : "secondary"
                                                        }
                                                        disabled={busy}
                                                        key={next}
                                                        aria-label={`Einsatz ${formatDateTime(shift.starts_at, timezone)} für ${planningEvent.title} ${shiftActionLabels[next].toLocaleLowerCase("de-CH")}`}
                                                        onClick={() =>
                                                          changeShiftStatus(
                                                            shift,
                                                            planningEvent.title,
                                                            next,
                                                          )
                                                        }
                                                      >
                                                        {shiftActionLabels[next]}
                                                      </Button>
                                                    ))}
                                                  </div>
                                                ) : null}
                                              </CardBody>
                                            </Card>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    <ShiftCreateForm
                                      org={org}
                                      eventId={planningEvent.id}
                                      eventTitle={planningEvent.title}
                                      control={control}
                                      busy={busy}
                                      onSubmit={submitShift}
                                    />
                                  </div>
                                </div>
                              </details>
                            </Card>
                          </li>,
                        ];
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </section>
      </div>
    </section>
  );
}

function ShiftCreateForm({
  org,
  eventId,
  eventTitle,
  control,
  busy,
  onSubmit,
}: Readonly<{
  org: string;
  eventId: string;
  eventTitle: string;
  control: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, eventId: string) => Promise<boolean>;
}>) {
  const [suggestion, setSuggestion] = useState<ShiftCrewSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [menuType, setMenuType] = useState<MenuType | "">("");
  const [requiredVolunteers, setRequiredVolunteers] = useState("");

  async function applySuggestion() {
    setSuggestionLoading(true);
    setSuggestionError(null);
    try {
      const result = await loadShiftCrewSuggestion(org, eventId);
      setSuggestion(result);
      if (result.menu_type) setMenuType(result.menu_type);
      if (result.required_volunteers) setRequiredVolunteers(String(result.required_volunteers));
    } catch (caught) {
      setSuggestionError(
        caught instanceof Error
          ? caught.message
          : "Der Crew-Vorschlag konnte nicht geladen werden.",
      );
    } finally {
      setSuggestionLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const created = await onSubmit(event, eventId);
    if (created) {
      setSuggestion(null);
      setMenuType("");
      setRequiredVolunteers("");
    }
  }

  return (
    <details className="rounded-lg border p-4">
      <summary className="min-h-11 cursor-pointer font-medium">Einsatz erstellen</summary>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void handleSubmit(e)}>
        <label htmlFor={`shift-${eventId}-starts-at`}>
          Beginn
          <input
            className={control}
            id={`shift-${eventId}-starts-at`}
            name="starts_at"
            type="datetime-local"
            required
          />
        </label>
        <label htmlFor={`shift-${eventId}-ends-at`}>
          Ende
          <input
            className={control}
            id={`shift-${eventId}-ends-at`}
            name="ends_at"
            type="datetime-local"
            required
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 sm:col-span-2">
          <Button
            disabled={suggestionLoading}
            onClick={() => void applySuggestion()}
            size="sm"
            type="button"
            variant="secondary"
          >
            {suggestionLoading ? "Wird geladen …" : "Crew-Vorschlag übernehmen"}
          </Button>
          {suggestion ? (
            suggestion.menu_type && suggestion.required_volunteers ? (
              <span className="text-sm">
                Vorschlag: {menuTypeLabels[suggestion.menu_type]} · {suggestion.required_volunteers}{" "}
                Griller — bleibt änderbar
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Keine passende Crew-Regel gefunden — bitte manuell erfassen.
              </span>
            )
          ) : (
            <span className="text-sm text-muted-foreground">
              Vorschlag basiert auf den Crew-Regeln in den Einstellungen.
            </span>
          )}
        </div>
        {suggestionError ? (
          <p className="text-sm text-status-error sm:col-span-2" role="alert">
            {suggestionError}
          </p>
        ) : null}
        <label htmlFor={`shift-${eventId}-menu-type`}>
          Menü
          <select
            className={control}
            id={`shift-${eventId}-menu-type`}
            name="menu_type"
            value={menuType}
            onChange={(e) => setMenuType(e.target.value as MenuType | "")}
          >
            <option value="">Kein Menü</option>
            {Object.entries(menuTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`shift-${eventId}-required-volunteers`}>
          Benötigte Helfende
          <input
            className={control}
            id={`shift-${eventId}-required-volunteers`}
            min="1"
            name="required_volunteers"
            type="number"
            value={requiredVolunteers}
            onChange={(e) => setRequiredVolunteers(e.target.value)}
            required
          />
        </label>
        <label htmlFor={`shift-${eventId}-public-note`}>
          Öffentliche Notiz
          <textarea className={control} id={`shift-${eventId}-public-note`} name="public_note" />
        </label>
        <label htmlFor={`shift-${eventId}-internal-note`}>
          Interne Notiz
          <textarea
            className={control}
            id={`shift-${eventId}-internal-note`}
            name="internal_note"
          />
        </label>
        <Button
          className="sm:self-end"
          disabled={busy}
          aria-label={`Einsatz für ${eventTitle} erstellen`}
          type="submit"
        >
          Einsatz erstellen
        </Button>
      </form>
    </details>
  );
}
