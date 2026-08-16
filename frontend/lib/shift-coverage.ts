import type { PlanningEvent, Shift, ShiftType } from "@/lib/planning";

export type OccupancyStatus = "FULL" | "PARTIAL" | "NONE" | "NOT_PLANNED";

export function shiftOccupancy(shifts: Shift[], type: ShiftType) {
  const active = shifts.filter(
    (shift) => shift.shift_type === type && shift.status !== "CANCELLED",
  );
  const required = active.reduce((sum, shift) => sum + shift.required_volunteers, 0);
  const occupied = active.reduce((sum, shift) => sum + shift.occupied_volunteers, 0);
  return { active, required, occupied };
}

export function occupancyStatus(required: number, occupied: number): OccupancyStatus {
  if (required === 0) return "NOT_PLANNED";
  if (occupied >= required) return "FULL";
  if (occupied > 0) return "PARTIAL";
  return "NONE";
}

/** Combine a "YYYY-MM-DD" date with an "HH:MM" local time into an ISO instant,
 * resolving the offset for the given IANA timezone. Mirrors the identically
 * behaving helpers duplicated in the Kiosk/Grill planning panels. */
export function localTimeToIso(dateStr: string, timeStr: string, timezone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!);
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

/** The organization-timezone-local calendar date ("YYYY-MM-DD") an instant falls on. */
export function localDateOf(isoInstant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoInstant));
}

/** The wall-clock time range a match occupies, using the event's own duration
 * when set and the organization's configured default otherwise. Returns null
 * when the event has no kickoff time to anchor a range to. */
export function matchTimeRange(
  event: Pick<PlanningEvent, "date" | "kickoff_time" | "duration_minutes">,
  timezone: string,
  defaultDurationMinutes: number,
): { start: Date; end: Date } | null {
  if (!event.kickoff_time) return null;
  const start = new Date(localTimeToIso(event.date, event.kickoff_time.slice(0, 5), timezone));
  const minutes = event.duration_minutes ?? defaultDurationMinutes;
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

/** Shifts relevant to a given match: those directly linked via event_id (the
 * shift's own event association) plus any whose time range overlaps the
 * match's kickoff window by at least a minute. A Kiosk/Grill window can cover
 * several matches on the same day/venue, and its materialized shifts only
 * carry the first covered event's id — so event_id alone misses every other
 * match the window actually covers. */
export function shiftsCoveringEvent(
  shifts: Shift[],
  event: PlanningEvent,
  timezone: string,
  defaultDurationMinutes: number,
): Shift[] {
  const range = matchTimeRange(event, timezone, defaultDurationMinutes);
  return shifts.filter((shift) => {
    if (shift.event_id === event.id) return true;
    if (!range) return false;
    const shiftStart = new Date(shift.starts_at).getTime();
    const shiftEnd = new Date(shift.ends_at).getTime();
    return shiftStart < range.end.getTime() && shiftEnd > range.start.getTime();
  });
}
