"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { loadAdminPlanningData } from "@/lib/admin-planning-data";
import type { PlanningEvent, Shift, ShiftType } from "@/lib/planning";
import {
  localDateOf,
  occupancyStatus,
  shiftOccupancy,
  type OccupancyStatus,
} from "@/lib/shift-coverage";

function dateHeading(value: string) {
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(value));
}

const statusVariant: Record<OccupancyStatus, BadgeProps["variant"]> = {
  FULL: "success",
  PARTIAL: "warning",
  NONE: "error",
  NOT_PLANNED: "neutral",
};

function CoverageBadge({ type, status }: Readonly<{ type: ShiftType; status: OccupancyStatus }>) {
  const label = type === "KIOSK" ? "Kiosk" : "Grill";
  if (status === "NOT_PLANNED") return <Badge variant="neutral">{label} nicht vorgesehen</Badge>;
  return <Badge variant={statusVariant[status]}>{label} offen</Badge>;
}

function HelperList({
  heading,
  shifts,
  timezone,
}: Readonly<{ heading: string; shifts: Shift[]; timezone: string }>) {
  const entries = shifts
    .flatMap((shift) => shift.signups.map((signup) => ({ signup, shift })))
    .sort((left, right) => left.shift.starts_at.localeCompare(right.shift.starts_at));
  return (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground">{heading}</h4>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Noch niemand zugewiesen.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {entries.map(({ signup, shift }) => (
            <li key={signup.id} className="rounded-md border p-2.5 text-sm">
              <p className="font-medium">
                {signup.first_name} {signup.last_name}
              </p>
              <p className="text-muted-foreground">
                {signup.phone} · {formatTime(shift.starts_at, timezone)}–
                {formatTime(shift.ends_at, timezone)} Uhr
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type DayEntry = { events: PlanningEvent[]; shifts: Shift[] };

export function MatchdayOverviewPanel({
  org,
  timezone,
}: Readonly<{ org: string; timezone: string }>) {
  const [events, setEvents] = useState<PlanningEvent[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadAdminPlanningData(org);
        if (!alive) return;
        setEvents(data.events);
        setShifts(data.shifts);
      } catch (caught) {
        if (!alive) return;
        setError(
          caught instanceof Error ? caught.message : "Die Spieltage konnten nicht geladen werden.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [org]);

  const days = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const map = new Map<string, DayEntry>();
    events.forEach((event) => {
      const entry = map.get(event.date) ?? { events: [], shifts: [] };
      entry.events.push(event);
      map.set(event.date, entry);
    });
    shifts.forEach((shift) => {
      const date = localDateOf(shift.starts_at, timezone);
      const entry = map.get(date) ?? { events: [], shifts: [] };
      entry.shifts.push(shift);
      map.set(date, entry);
    });
    return [...map.entries()]
      .filter(([date]) => (tab === "past" ? date < todayStr : date >= todayStr))
      .sort(([left], [right]) => left.localeCompare(right));
  }, [events, shifts, tab, timezone]);

  return (
    <section className="grid gap-6" aria-labelledby="matchdays-title">
      <PageHeader
        headingId="matchdays-title"
        title="Spieltage"
        description="Tagesübersicht mit Kiosk-/Grill-Deckung, zugewiesenen Helfern und Spielen pro Spieltag."
      />

      <div className="flex gap-2 border-b" role="tablist" aria-label="Zeitraum">
        <Button
          role="tab"
          aria-selected={tab === "upcoming"}
          variant={tab === "upcoming" ? "primary" : "ghost"}
          onClick={() => setTab("upcoming")}
        >
          Aktuell
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "past"}
          variant={tab === "past" ? "primary" : "ghost"}
          onClick={() => setTab("past")}
        >
          Vergangene
        </Button>
      </div>

      {error ? (
        <Card role="alert">
          <CardBody>
            <p>{error}</p>
          </CardBody>
        </Card>
      ) : loading ? (
        <Card role="status" aria-live="polite">
          <CardBody>Spieltage werden geladen …</CardBody>
        </Card>
      ) : days.length === 0 ? (
        <Card role="status">
          <CardBody>
            <h2 className="text-lg font-semibold">
              {tab === "past" ? "Keine vergangenen Spieltage" : "Keine Spieltage"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {tab === "past"
                ? "Für vergangene Anlässe gibt es hier noch keine Einträge."
                : "Sobald Anlässe geplant sind, erscheinen die Spieltage hier."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4">
          {days.map(([date, day]) => {
            const kiosk = shiftOccupancy(day.shifts, "KIOSK");
            const kioskStatus = occupancyStatus(kiosk.required, kiosk.occupied);
            const grill = shiftOccupancy(day.shifts, "GRILL");
            const grillStatus = occupancyStatus(grill.required, grill.occupied);
            const sortedEvents = [...day.events].sort((left, right) =>
              (left.kickoff_time ?? "").localeCompare(right.kickoff_time ?? ""),
            );
            return (
              <Card key={date}>
                <details className="group">
                  <summary
                    className="min-h-11 cursor-pointer list-none p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
                    aria-label={`Spieltag ${dateHeading(date)} anzeigen`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold capitalize">{dateHeading(date)}</h3>
                      <div className="flex flex-wrap gap-2">
                        <CoverageBadge type="KIOSK" status={kioskStatus} />
                        <CoverageBadge type="GRILL" status={grillStatus} />
                      </div>
                    </div>
                  </summary>
                  <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                    <HelperList heading="Kiosk-Helfer" shifts={kiosk.active} timezone={timezone} />
                    <HelperList heading="Grill-Helfer" shifts={grill.active} timezone={timezone} />
                    <div className="sm:col-span-2">
                      <h4 className="text-sm font-semibold text-muted-foreground">
                        Spiele an diesem Tag
                      </h4>
                      <ul className="mt-2 text-sm">
                        {sortedEvents.map((event) => (
                          <li
                            key={event.id}
                            className="border-b border-border/60 py-1 last:border-b-0"
                          >
                            <span className="font-semibold tabular-nums">
                              {event.kickoff_time ? event.kickoff_time.slice(0, 5) : "Zeit offen"}
                            </span>
                            {" – "}
                            <span className="font-semibold">{event.title}</span>
                            {event.public_description ? (
                              <>
                                {" – "}
                                <span className="text-muted-foreground">
                                  {event.public_description}
                                </span>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
