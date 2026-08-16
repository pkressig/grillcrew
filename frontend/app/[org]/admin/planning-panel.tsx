"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  assignVolunteer,
  cancelSignup,
  createEvent,
  createShift,
  deleteEvent,
  deleteShift,
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
import { loadFamilyVolunteers, type FamilyVolunteer } from "@/lib/families";
import { loadOrganizationSettings } from "@/lib/settings";
import { ShiftVolunteerAssignment } from "@/components/shift-volunteer-assignment";
import { occupancyStatus, shiftOccupancy, shiftsCoveringEvent } from "@/lib/shift-coverage";

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
// Statuses a bulk action can touch: publish (DRAFT), cancel (DRAFT/PUBLISHED), or hard-delete
// (CANCELLED/COMPLETED). POSTPONED is deliberately excluded — no bulk action covers it today,
// so offering its checkbox would just invite a selection nothing can be done with.
const selectableEventStatuses = new Set<EventStatus>([
  "DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "COMPLETED",
]);
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

type BulkEventActionMessages = {
  successOne: string;
  successMany: (succeeded: number) => string;
  partial: (succeeded: number, total: number, failed: number) => string;
  failOne: string;
  failMany: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function serviceBadge(shifts: Shift[], type: Shift["shift_type"]) {
  const { required, occupied } = shiftOccupancy(shifts, type);
  const status = occupancyStatus(required, occupied);
  if (status === "NOT_PLANNED")
    return {
      label: type === "KIOSK" ? "Kiosk nicht vorgesehen" : "Grill nicht vorgesehen",
      variant: "neutral" as const,
    };
  if (status === "FULL")
    return {
      label: type === "KIOSK" ? "Kiosk besetzt" : "Grill besetzt",
      variant: "success" as const,
    };
  if (status === "PARTIAL")
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
  const [defaultGameDurationMinutes, setDefaultGameDurationMinutes] = useState(90);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [eventTab, setEventTab] = useState<"upcoming" | "past">("upcoming");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [bulkPublishOpen, setBulkPublishOpen] = useState(false);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [volunteers, setVolunteers] = useState<FamilyVolunteer[]>([]);
  const requestId = useRef(0);

  const activeSeasons = useMemo(
    () => seasons.filter((season) => season.status !== "CLOSED" && season.status !== "ARCHIVED"),
    [seasons],
  );
  const filteredEvents = useMemo(() => {
    const activeIds = new Set(activeSeasons.map((season) => season.id));
    const query = search.trim().toLocaleLowerCase("de-CH");
    // Past events clutter the default view once a season has many imported
    // games; they stay fully reachable via the separate "Vergangene Anlässe"
    // tab instead of being mixed into the upcoming list.
    const todayStr = new Date().toISOString().slice(0, 10);
    return events.filter((event) => {
      const haystack = [event.title, event.public_description, event.internal_note]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-CH");
      return (
        activeIds.has(event.season_id) &&
        (eventTab === "past" ? event.date < todayStr : event.date >= todayStr) &&
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
    eventTab,
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

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError(null);
    try {
      const [data] = await Promise.all([
        loadAdminPlanningData(org, (planning) => {
          if (currentRequest !== requestId.current) return;
          setSeasons(planning.seasons);
        }),
        // Loaded once for the whole panel (not per shift) so the "Helfer zuweisen" dropdowns
        // don't each fire their own request; a failure here must not block the rest of the
        // planning data, since assignment is a secondary action on this page.
        loadFamilyVolunteers(org)
          .then((items) => {
            if (currentRequest === requestId.current) setVolunteers(items);
          })
          .catch(() => {
            if (currentRequest === requestId.current) setVolunteers([]);
          }),
        // Only used as the fallback match duration for the Kiosk/Grill overlap
        // check below; a failure here must not block the rest of the page.
        loadOrganizationSettings(org)
          .then((settings) => {
            if (currentRequest === requestId.current)
              setDefaultGameDurationMinutes(settings.default_game_duration_minutes);
          })
          .catch(() => {
            // Keep the built-in 90-minute fallback.
          }),
      ]);
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

  useEffect(() => {
    setSelectedEventIds((current) => {
      if (current.size === 0) return current;
      const selectableIds = new Set(
        events
          .filter((event) => selectableEventStatuses.has(event.status))
          .map((event) => event.id),
      );
      const next = new Set([...current].filter((id) => selectableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [events]);

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

  function toggleEventSelection(eventId: string) {
    setSelectedEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function clearEventSelection() {
    setSelectedEventIds(new Set());
  }

  async function runBulkEventAction(
    ids: string[],
    action: (id: string) => Promise<unknown>,
    messages: BulkEventActionMessages,
    closeDialog: () => void,
  ) {
    setBulkBusy(true);
    setError(null);
    setSuccess(null);
    const results = await Promise.allSettled(ids.map((id) => action(id)));
    const failedCount = results.filter((result) => result.status === "rejected").length;
    const succeededCount = ids.length - failedCount;
    if (failedCount === 0) {
      setSuccess(succeededCount === 1 ? messages.successOne : messages.successMany(succeededCount));
    } else if (succeededCount > 0) {
      setError(messages.partial(succeededCount, ids.length, failedCount));
    } else {
      setError(ids.length === 1 ? messages.failOne : messages.failMany);
    }
    setSelectedEventIds(new Set());
    closeDialog();
    await refresh();
    setBulkBusy(false);
  }

  function publishSelectedEvents() {
    return runBulkEventAction(
      publishEligibleEvents.map((event) => event.id),
      (id) => updateEventStatus(org, id, "PUBLISHED"),
      {
        successOne: "1 Anlass wurde veröffentlicht.",
        successMany: (n) => `${n} Anlässe wurden veröffentlicht.`,
        partial: (s, t, f) => `${s} von ${t} Anlässen veröffentlicht — ${f} Fehler.`,
        failOne: "Der Anlass konnte nicht veröffentlicht werden.",
        failMany: "Die Anlässe konnten nicht veröffentlicht werden.",
      },
      () => setBulkPublishOpen(false),
    );
  }

  function cancelSelectedEvents() {
    return runBulkEventAction(
      cancelEligibleEvents.map((event) => event.id),
      (id) => updateEventStatus(org, id, "CANCELLED"),
      {
        successOne: "1 Anlass wurde abgesagt.",
        successMany: (n) => `${n} Anlässe wurden abgesagt.`,
        partial: (s, t, f) => `${s} von ${t} Anlässen abgesagt — ${f} Fehler.`,
        failOne: "Der Anlass konnte nicht abgesagt werden.",
        failMany: "Die Anlässe konnten nicht abgesagt werden.",
      },
      () => setBulkCancelOpen(false),
    );
  }

  function deleteSelectedEvents() {
    return runBulkEventAction(
      deleteEligibleEvents.map((event) => event.id),
      (id) => deleteEvent(org, id),
      {
        successOne: "1 Anlass wurde endgültig gelöscht.",
        successMany: (n) => `${n} Anlässe wurden endgültig gelöscht.`,
        partial: (s, t, f) => `${s} von ${t} Anlässen endgültig gelöscht — ${f} Fehler.`,
        failOne: "Der Anlass konnte nicht endgültig gelöscht werden.",
        failMany: "Die Anlässe konnten nicht endgültig gelöscht werden.",
      },
      () => setBulkDeleteOpen(false),
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

  function removeShift(shift: Shift, eventTitle: string) {
    if (
      !window.confirm(
        `Einsatz ${formatDateTime(shift.starts_at, timezone)} für "${eventTitle}" endgültig löschen?`,
      )
    )
      return;
    void run(() => deleteShift(org, shift.id), "Der Einsatz wurde endgültig gelöscht.");
  }

  function assignShiftVolunteer(shift: Shift, volunteerId: string): Promise<boolean> {
    const volunteer = volunteers.find((item) => item.id === volunteerId);
    return run(
      () => assignVolunteer(org, shift.id, volunteerId),
      volunteer
        ? `${volunteer.first_name} ${volunteer.last_name} wurde dem Einsatz zugewiesen.`
        : "Der Helfer wurde dem Einsatz zugewiesen.",
    );
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

  const selectedEventsForModal = events.filter((event) => selectedEventIds.has(event.id));
  // Eligibility differs per bulk action, and a selection can be mixed (e.g. some DRAFT, some
  // already CANCELLED). Each action only ever touches its own eligible subset — never the
  // untouched rest of the selection — and every dialog below states plainly when that subset
  // is smaller than what the admin actually selected.
  const publishEligibleEvents = selectedEventsForModal.filter((event) => event.status === "DRAFT");
  const cancelEligibleEvents = selectedEventsForModal.filter(
    (event) => event.status === "DRAFT" || event.status === "PUBLISHED",
  );
  const deleteEligibleEvents = selectedEventsForModal.filter(
    (event) => event.status === "CANCELLED" || event.status === "COMPLETED",
  );

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
      {bulkPublishOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-publish-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
        >
          <Card className="w-full max-w-2xl">
            <CardBody>
              <h2 id="bulk-publish-title" className="text-xl font-semibold">
                {publishEligibleEvents.length === 1
                  ? "1 Anlass veröffentlichen"
                  : `${publishEligibleEvents.length} Anlässe veröffentlichen`}
              </h2>
              <p className="mt-2 text-sm">
                Die ausgewählten Anlässe werden veröffentlicht und damit öffentlich sichtbar.
              </p>
              {publishEligibleEvents.length < selectedEventsForModal.length ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {publishEligibleEvents.length} von {selectedEventsForModal.length} ausgewählten
                  Anlässen betroffen — nur Entwürfe können veröffentlicht werden.
                </p>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <caption className="sr-only">Zur Veröffentlichung ausgewählte Anlässe</caption>
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Datum
                      </th>
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Uhrzeit
                      </th>
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Kategorie
                      </th>
                      <th className="py-2 font-semibold" scope="col">
                        Mannschaften
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishEligibleEvents.map((item) => (
                      <tr className="border-b last:border-0" key={item.id}>
                        <td className="py-2 pr-3">{formatDate(item.date)}</td>
                        <td className="py-2 pr-3">
                          {item.kickoff_time ? item.kickoff_time.slice(0, 5) : "–"}
                        </td>
                        <td className="py-2 pr-3">{item.event_type}</td>
                        <td className="py-2">{item.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button
                  className="min-h-11"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => setBulkPublishOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  className="min-h-11"
                  disabled={bulkBusy}
                  onClick={() => void publishSelectedEvents()}
                >
                  {publishEligibleEvents.length === 1
                    ? "1 Anlass veröffentlichen"
                    : `${publishEligibleEvents.length} Anlässe veröffentlichen`}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}
      {bulkCancelOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-cancel-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
        >
          <Card className="w-full max-w-2xl">
            <CardBody>
              <h2 id="bulk-cancel-title" className="text-xl font-semibold">
                {cancelEligibleEvents.length === 1
                  ? "1 Anlass absagen"
                  : `${cancelEligibleEvents.length} Anlässe absagen`}
              </h2>
              <p className="mt-2 text-sm">Die ausgewählten Anlässe werden abgesagt.</p>
              {cancelEligibleEvents.length < selectedEventsForModal.length ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {cancelEligibleEvents.length} von {selectedEventsForModal.length} ausgewählten
                  Anlässen betroffen — nur Entwürfe und veröffentlichte Anlässe können abgesagt
                  werden.
                </p>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <caption className="sr-only">Zur Absage ausgewählte Anlässe</caption>
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Datum
                      </th>
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Uhrzeit
                      </th>
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Kategorie
                      </th>
                      <th className="py-2 font-semibold" scope="col">
                        Mannschaften
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelEligibleEvents.map((item) => (
                      <tr className="border-b last:border-0" key={item.id}>
                        <td className="py-2 pr-3">{formatDate(item.date)}</td>
                        <td className="py-2 pr-3">
                          {item.kickoff_time ? item.kickoff_time.slice(0, 5) : "–"}
                        </td>
                        <td className="py-2 pr-3">{item.event_type}</td>
                        <td className="py-2">{item.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button
                  className="min-h-11"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => setBulkCancelOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  className="min-h-11"
                  variant="destructive"
                  disabled={bulkBusy}
                  onClick={() => void cancelSelectedEvents()}
                >
                  {cancelEligibleEvents.length === 1
                    ? "1 Anlass absagen"
                    : `${cancelEligibleEvents.length} Anlässe absagen`}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}
      {bulkDeleteOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-delete-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
        >
          <Card className="w-full max-w-2xl">
            <CardBody>
              <h2 id="bulk-delete-title" className="text-xl font-semibold">
                {deleteEligibleEvents.length === 1
                  ? "1 Anlass endgültig löschen"
                  : `${deleteEligibleEvents.length} Anlässe endgültig löschen`}
              </h2>
              <p
                role="alert"
                className="mt-2 rounded-md border border-status-error p-3 text-sm text-status-error"
              >
                Diese Aktion kann nicht rückgängig gemacht werden. Zugehörige Einsätze, Anmeldungen
                und Arbeitsnachweise werden dauerhaft entfernt.
              </p>
              {deleteEligibleEvents.length < selectedEventsForModal.length ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {deleteEligibleEvents.length} von {selectedEventsForModal.length} ausgewählten
                  Anlässen betroffen — nur abgesagte oder erledigte Anlässe können endgültig
                  gelöscht werden.
                </p>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <caption className="sr-only">Zum endgültigen Löschen ausgewählte Anlässe</caption>
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Datum
                      </th>
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Uhrzeit
                      </th>
                      <th className="py-2 pr-3 font-semibold" scope="col">
                        Kategorie
                      </th>
                      <th className="py-2 font-semibold" scope="col">
                        Mannschaften
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deleteEligibleEvents.map((item) => (
                      <tr className="border-b last:border-0" key={item.id}>
                        <td className="py-2 pr-3">{formatDate(item.date)}</td>
                        <td className="py-2 pr-3">
                          {item.kickoff_time ? item.kickoff_time.slice(0, 5) : "–"}
                        </td>
                        <td className="py-2 pr-3">{item.event_type}</td>
                        <td className="py-2">{item.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button
                  className="min-h-11"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => setBulkDeleteOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  className="min-h-11"
                  variant="destructive"
                  disabled={bulkBusy}
                  onClick={() => void deleteSelectedEvents()}
                >
                  {deleteEligibleEvents.length === 1
                    ? "1 Anlass endgültig löschen"
                    : `${deleteEligibleEvents.length} Anlässe endgültig löschen`}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
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
          <div className="flex gap-2 border-b" role="tablist" aria-label="Zeitraum">
            <Button
              type="button"
              role="tab"
              aria-selected={eventTab === "upcoming"}
              variant={eventTab === "upcoming" ? "primary" : "ghost"}
              onClick={() => setEventTab("upcoming")}
            >
              Kommende Anlässe
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={eventTab === "past"}
              variant={eventTab === "past" ? "primary" : "ghost"}
              onClick={() => setEventTab("past")}
            >
              Vergangene Anlässe
            </Button>
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
          {selectedEventIds.size > 0 ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
              role="region"
              aria-label="Mehrfachauswahl Anlässe"
            >
              <p className="text-sm font-medium">
                {selectedEventIds.size} {selectedEventIds.size === 1 ? "Anlass" : "Anlässe"}{" "}
                ausgewählt
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  variant="secondary"
                  type="button"
                  onClick={clearEventSelection}
                >
                  Auswahl aufheben
                </Button>
                <Button
                  className="min-h-11"
                  type="button"
                  disabled={publishEligibleEvents.length === 0}
                  onClick={() => setBulkPublishOpen(true)}
                >
                  {publishEligibleEvents.length === 1
                    ? "1 Anlass veröffentlichen"
                    : `Ausgewählte veröffentlichen (${publishEligibleEvents.length})`}
                </Button>
                <Button
                  className="min-h-11"
                  variant="destructive"
                  type="button"
                  disabled={cancelEligibleEvents.length === 0}
                  onClick={() => setBulkCancelOpen(true)}
                >
                  {cancelEligibleEvents.length === 1
                    ? "1 Anlass absagen"
                    : `Ausgewählte absagen (${cancelEligibleEvents.length})`}
                </Button>
                <Button
                  className="min-h-11"
                  variant="destructive"
                  type="button"
                  disabled={deleteEligibleEvents.length === 0}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  {deleteEligibleEvents.length === 1
                    ? "1 Anlass endgültig löschen"
                    : `Ausgewählte endgültig löschen (${deleteEligibleEvents.length})`}
                </Button>
              </div>
            </div>
          ) : null}
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
                      {eventTab === "past"
                        ? "In dieser Saison gibt es keine vergangenen Anlässe."
                        : "In dieser Saison sind noch keine bevorstehenden Anlässe vorhanden."}
                    </p>
                  ) : (
                    <ul className="grid gap-4" aria-label={`Agenda ${season.name}`}>
                      {seasonEvents.map((planningEvent, eventIndex) => {
                        const eventShifts = shiftsCoveringEvent(
                          shifts,
                          planningEvent,
                          timezone,
                          defaultGameDurationMinutes,
                        );
                        const dateTile = eventDateTile(planningEvent.date);
                        const previousDate =
                          eventIndex > 0 ? seasonEvents[eventIndex - 1]!.date : null;
                        return [
                          planningEvent.date !== previousDate ? (
                            <li key={`day-${planningEvent.date}`}>
                              <h5 className="border-b border-border/80 pb-2 font-semibold">
                                {formatDate(planningEvent.date)}
                              </h5>
                            </li>
                          ) : null,
                          <li key={planningEvent.id}>
                            <div className="flex items-start gap-2">
                              {selectableEventStatuses.has(planningEvent.status) ? (
                                <div className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                                  <input
                                    aria-label={`Anlass ${planningEvent.title} am ${formatDate(planningEvent.date)} auswählen`}
                                    checked={selectedEventIds.has(planningEvent.id)}
                                    className="size-5"
                                    onChange={() => toggleEventSelection(planningEvent.id)}
                                    type="checkbox"
                                  />
                                </div>
                              ) : null}
                              <Card className="min-w-0 flex-1 overflow-hidden border-border/80 transition-shadow hover:shadow-md">
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
                                                <Badge
                                                  className="mt-2 mr-2"
                                                  variant={kiosk.variant}
                                                >
                                                  {kiosk.label}
                                                </Badge>
                                                <Badge
                                                  className="mt-2 mr-2"
                                                  variant={grill.variant}
                                                >
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
                                                        {formatDateTime(shift.starts_at, timezone)}{" "}
                                                        – {formatDateTime(shift.ends_at, timezone)}
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
                                                                      keepPersistedAttendance(
                                                                        signup,
                                                                      );
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
                                                    <ShiftVolunteerAssignment
                                                      shift={shift}
                                                      eventTitle={planningEvent.title}
                                                      volunteers={volunteers}
                                                      timezone={timezone}
                                                      busy={busy}
                                                      onAssign={(volunteerId) =>
                                                        assignShiftVolunteer(shift, volunteerId)
                                                      }
                                                    />
                                                  </div>
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
                                                    <Button
                                                      variant="destructive"
                                                      disabled={busy}
                                                      aria-label={`Einsatz ${formatDateTime(shift.starts_at, timezone)} für ${planningEvent.title} löschen`}
                                                      onClick={() =>
                                                        removeShift(shift, planningEvent.title)
                                                      }
                                                    >
                                                      Löschen
                                                    </Button>
                                                  </div>
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
                            </div>
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
