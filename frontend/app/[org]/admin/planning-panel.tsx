"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  createClubYear,
  cancelSignup,
  createEvent,
  createSeason,
  createShift,
  updateEventStatus,
  updateSeasonStatus,
  updateShiftStatus,
  updateSignupAttendance,
  type AdminSignup,
  type ClubYear,
  type EventStatus,
  type PlanningEvent,
  type PlanningStatus,
  type Season,
  type SeasonType,
  type Shift,
  type ShiftStatus,
  type SignupOutcome,
} from "@/lib/planning";
import { loadAdminPlanningData } from "@/lib/admin-planning-data";

const statusLabels: Record<PlanningStatus, string> = {
  DRAFT: "Entwurf",
  ACTIVE: "Aktiv",
  CLOSED: "Geschlossen",
  ARCHIVED: "Archiviert",
};
const typeLabels: Record<SeasonType, string> = {
  AUTUMN: "Herbst",
  SPRING: "Frühling",
  OTHER: "Andere",
};
const actions: Record<PlanningStatus, PlanningStatus[]> = {
  DRAFT: ["ACTIVE", "CLOSED", "ARCHIVED"],
  ACTIVE: ["CLOSED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};
const actionLabels: Partial<Record<PlanningStatus, string>> = {
  ACTIVE: "Aktivieren",
  CLOSED: "Schliessen",
  ARCHIVED: "Archivieren",
};
const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  POSTPONED: "Verschoben",
  CANCELLED: "Abgesagt",
  COMPLETED: "Erledigt",
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
const planningStatusVariants: Record<PlanningStatus, BadgeProps["variant"]> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  CLOSED: "warning",
  ARCHIVED: "neutral",
};
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
  CANCELLED: [],
  COMPLETED: [],
};
const eventActionLabels: Partial<Record<EventStatus, string>> = {
  PUBLISHED: "Veröffentlichen",
  POSTPONED: "Verschieben",
  CANCELLED: "Absagen",
  COMPLETED: "Erledigen",
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

function dateRange(start: string, end: string) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("de-CH").format(new Date(`${value}T00:00:00`));
  return `${format(start)} – ${format(end)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function eventDateTile(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("de-CH", { weekday: "short", timeZone: "UTC" }).format(date),
    day: new Intl.DateTimeFormat("de-CH", { day: "2-digit", timeZone: "UTC" }).format(date),
    month: new Intl.DateTimeFormat("de-CH", { month: "short", timeZone: "UTC" }).format(date),
  };
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
  const [clubYears, setClubYears] = useState<ClubYear[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [events, setEvents] = useState<PlanningEvent[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError(null);
    try {
      const data = await loadAdminPlanningData(org, (planning) => {
        if (currentRequest !== requestId.current) return;
        setClubYears(planning.clubYears);
        setSeasons(planning.seasons);
        setCurrentSeason(planning.currentSeason);
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
    setClubYears([]);
    setSeasons([]);
    setCurrentSeason(null);
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

  async function submitClubYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await run(
      () =>
        createClubYear(org, {
          label: String(data.get("label")),
          start_date: String(data.get("start_date")),
          end_date: String(data.get("end_date")),
          status: "DRAFT",
        }),
      "Vereinsjahr wurde erstellt.",
    );
    if (created) form.reset();
  }

  async function submitSeason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await run(
      () =>
        createSeason(org, String(data.get("club_year_id")), {
          type: data.get("type") as SeasonType,
          name: String(data.get("name")),
          start_date: String(data.get("start_date")),
          end_date: String(data.get("end_date")),
          status: "DRAFT",
        }),
      "Saison wurde erstellt.",
    );
    if (created) form.reset();
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
          status: "DRAFT",
        }),
      "Anlass wurde erstellt.",
    );
    if (created) form.reset();
  }

  async function submitShift(event: FormEvent<HTMLFormElement>, eventId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
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
        }),
      "Einsatz wurde erstellt.",
    );
    if (created) form.reset();
  }

  function updateStatus(season: Season, next: PlanningStatus) {
    const confirmation =
      next === "CLOSED"
        ? `Saison "${season.name}" wirklich schliessen? Danach sind nur noch eingeschränkte Änderungen möglich.`
        : next === "ARCHIVED"
          ? `Saison "${season.name}" wirklich archivieren? Archivierte Saisons können nicht mehr bearbeitet werden.`
          : null;

    if (confirmation && !window.confirm(confirmation)) return;

    void run(() => updateSeasonStatus(org, season.id, next), "Saisonstatus wurde aktualisiert.");
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
        description="Anlässe und Einsätze planen."
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
          <div>
            <h2 id="events-title" className="text-xl font-semibold">
              Agenda
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Anlässe nach Saison planen und die benötigten Einsätze erfassen.
            </p>
          </div>
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
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
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
              <Button className="sm:self-end" disabled={busy || seasons.length === 0} type="submit">
                Anlass erstellen
              </Button>
            </form>
          </details>
          {seasons.length === 0 ? (
            <p className="text-muted-foreground">
              Erstellen Sie zuerst eine Saison, bevor Sie Anlässe planen.
            </p>
          ) : (
            seasons.map((season) => {
              const seasonEvents = events
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.season_id === season.id)
                .sort(
                  (left, right) =>
                    left.item.date.localeCompare(right.item.date) || left.index - right.index,
                )
                .map(({ item }) => item);
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
                  ) : (
                    <ul className="grid gap-4">
                      {seasonEvents.map((planningEvent) => {
                        const eventShifts = shifts.filter(
                          (shift) => shift.event_id === planningEvent.id,
                        );
                        const dateTile = eventDateTile(planningEvent.date);
                        return (
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
                                          {formatDate(planningEvent.date)} ·{" "}
                                          {planningEvent.location}
                                        </p>
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
                                                    <Badge className="mt-2" variant="neutral">
                                                      {shift.occupied_volunteers} von{" "}
                                                      {shift.required_volunteers} belegt
                                                    </Badge>
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
                                    <details className="rounded-lg border p-4">
                                      <summary className="min-h-11 cursor-pointer font-medium">
                                        Einsatz erstellen
                                      </summary>
                                      <form
                                        className="mt-3 grid gap-3 sm:grid-cols-2"
                                        onSubmit={(formEvent) =>
                                          submitShift(formEvent, planningEvent.id)
                                        }
                                      >
                                        <label htmlFor={`shift-${planningEvent.id}-starts-at`}>
                                          Beginn
                                          <input
                                            className={control}
                                            id={`shift-${planningEvent.id}-starts-at`}
                                            name="starts_at"
                                            type="datetime-local"
                                            required
                                          />
                                        </label>
                                        <label htmlFor={`shift-${planningEvent.id}-ends-at`}>
                                          Ende
                                          <input
                                            className={control}
                                            id={`shift-${planningEvent.id}-ends-at`}
                                            name="ends_at"
                                            type="datetime-local"
                                            required
                                          />
                                        </label>
                                        <label
                                          htmlFor={`shift-${planningEvent.id}-required-volunteers`}
                                        >
                                          Benötigte Helfende
                                          <input
                                            className={control}
                                            id={`shift-${planningEvent.id}-required-volunteers`}
                                            min="1"
                                            name="required_volunteers"
                                            type="number"
                                            required
                                          />
                                        </label>
                                        <label htmlFor={`shift-${planningEvent.id}-public-note`}>
                                          Öffentliche Notiz
                                          <textarea
                                            className={control}
                                            id={`shift-${planningEvent.id}-public-note`}
                                            name="public_note"
                                          />
                                        </label>
                                        <label htmlFor={`shift-${planningEvent.id}-internal-note`}>
                                          Interne Notiz
                                          <textarea
                                            className={control}
                                            id={`shift-${planningEvent.id}-internal-note`}
                                            name="internal_note"
                                          />
                                        </label>
                                        <Button
                                          className="sm:self-end"
                                          disabled={busy}
                                          aria-label={`Einsatz für ${planningEvent.title} erstellen`}
                                          type="submit"
                                        >
                                          Einsatz erstellen
                                        </Button>
                                      </form>
                                    </details>
                                  </div>
                                </div>
                              </details>
                            </Card>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </section>
        <aside className="grid min-w-0 gap-5 lg:sticky lg:top-8" aria-labelledby="periods-title">
          <h2 id="periods-title" className="text-xl font-semibold">
            Planungsperioden
          </h2>
          <Card
            className="border-primary/20 bg-primary/5"
            aria-labelledby="current-season-title"
            role="region"
          >
            <CardBody>
              <h3 id="current-season-title" className="font-semibold">
                Aktuelle Saison
              </h3>
              {currentSeason ? (
                <p className="mt-2 text-sm">
                  <strong>{currentSeason.name}</strong> · {typeLabels[currentSeason.type]} ·{" "}
                  {dateRange(currentSeason.start_date, currentSeason.end_date)}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Derzeit ist keine Saison aktiv.
                </p>
              )}
            </CardBody>
          </Card>
          <section className="grid gap-3" aria-labelledby="club-years-title">
            <h3 id="club-years-title" className="font-semibold">
              Vereinsjahre
            </h3>
            {clubYears.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Vereinsjahre vorhanden.</p>
            ) : (
              <ul className="grid gap-2">
                {clubYears.map((year) => (
                  <li key={year.id}>
                    <Card className="border-border/80 shadow-sm">
                      <CardBody className="p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <strong>{year.label}</strong>
                          <Badge variant={planningStatusVariants[year.status]}>
                            {statusLabels[year.status]}
                          </Badge>
                        </div>
                        <p className="mt-1">
                          {dateRange(year.start_date, year.end_date)} ·{" "}
                          {seasons.filter((item) => item.club_year_id === year.id).length} Saisons
                        </p>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            <details className="rounded-lg border border-border/80 bg-background p-3 shadow-sm">
              <summary className="min-h-11 cursor-pointer font-medium">
                Vereinsjahr erstellen
              </summary>
              <form className="mt-3 grid gap-3" onSubmit={submitClubYear}>
                <label>
                  Label
                  <input className={control} name="label" placeholder="2026/27" required />
                </label>
                <label>
                  Startdatum
                  <input className={control} name="start_date" type="date" required />
                </label>
                <label>
                  Enddatum
                  <input className={control} name="end_date" type="date" required />
                </label>
                <Button disabled={busy} type="submit">
                  Vereinsjahr erstellen
                </Button>
              </form>
            </details>
          </section>
          <section className="grid gap-3" aria-labelledby="seasons-title">
            <h3 id="seasons-title" className="font-semibold">
              Saisons
            </h3>
            {seasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Saisons vorhanden.</p>
            ) : (
              <ul className="grid gap-2">
                {seasons.map((season) => (
                  <li key={season.id}>
                    <Card className="border-border/80 shadow-sm">
                      <CardBody className="p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <strong>{season.name}</strong>
                          <Badge variant={planningStatusVariants[season.status]}>
                            {statusLabels[season.status]}
                          </Badge>
                        </div>
                        <p className="mt-1">
                          {typeLabels[season.type]} ·{" "}
                          {dateRange(season.start_date, season.end_date)}
                          {currentSeason?.id === season.id ? " · Aktuelle Saison" : ""}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Vereinsjahr:{" "}
                          {clubYears.find((year) => year.id === season.club_year_id)?.label ??
                            "Nicht verfügbar"}
                        </p>
                        {actions[season.status].length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {actions[season.status].map((next) => (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                key={next}
                                aria-label={`Saison ${season.name} ${actionLabels[next]?.toLocaleLowerCase("de-CH")}`}
                                onClick={() => updateStatus(season, next)}
                              >
                                {actionLabels[next]}
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
            <details className="rounded-lg border border-border/80 bg-background p-3 shadow-sm">
              <summary className="min-h-11 cursor-pointer font-medium">Saison erstellen</summary>
              <form className="mt-3 grid gap-3" onSubmit={submitSeason}>
                <label>
                  Vereinsjahr
                  <select
                    className={control}
                    name="club_year_id"
                    required
                    disabled={clubYears.length === 0}
                  >
                    <option value="">Bitte wählen</option>
                    {clubYears.map((year) => (
                      <option key={year.id} value={year.id}>
                        {year.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Typ
                  <select className={control} name="type" defaultValue="AUTUMN">
                    <option value="AUTUMN">Herbst</option>
                    <option value="SPRING">Frühling</option>
                    <option value="OTHER">Andere</option>
                  </select>
                </label>
                <label>
                  Name
                  <input className={control} name="name" required />
                </label>
                <label>
                  Startdatum
                  <input className={control} name="start_date" type="date" required />
                </label>
                <label>
                  Enddatum
                  <input className={control} name="end_date" type="date" required />
                </label>
                <Button disabled={busy || clubYears.length === 0} type="submit">
                  Saison erstellen
                </Button>
              </form>
            </details>
          </section>
        </aside>
      </div>
    </section>
  );
}
