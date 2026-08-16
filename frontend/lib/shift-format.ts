/** Weekday + date + time heading used wherever a shift is listed to a
 * volunteer, e.g. "Freitag, 21.08.2026, 20:00–21:30 Uhr". */
export function formatShiftHeading(startsAt: string, endsAt: string, timeZone: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateFormatter = new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
  const timeFormatter = new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return `${dateFormatter.format(start)}, ${timeFormatter.format(start)}–${timeFormatter.format(end)} Uhr`;
}
