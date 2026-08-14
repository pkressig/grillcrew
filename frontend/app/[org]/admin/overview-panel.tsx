"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardCheck, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StatSummary } from "@/components/ui/stat-summary";
import { loadFamilies } from "@/lib/families";
import { loadAdminPlanningData, type AdminEventWithShifts } from "@/lib/admin-planning-data";

type OverviewData = { families: number; eventGroups: AdminEventWithShifts[] };

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function OverviewPanel({ org, timezone }: Readonly<{ org: string; timezone: string }>) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [planning, families] = await Promise.all([
        loadAdminPlanningData(org),
        loadFamilies(org),
      ]);
      if (currentRequest !== requestId.current) return;
      setData({ families: families.length, eventGroups: planning.eventGroups });
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      setError(
        caught instanceof Error ? caught.message : "Die Übersicht konnte nicht geladen werden.",
      );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    setData(null);
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  if (loading)
    return (
      <section aria-labelledby="overview-title" className="grid gap-7">
        <PageHeader
          headingId="overview-title"
          title="Übersicht"
          description="Die aktuellen Organisationsdaten werden geladen."
        />
        <p role="status" aria-live="polite">
          Übersicht wird geladen …
        </p>
      </section>
    );

  if (error)
    return (
      <section aria-labelledby="overview-title" className="grid gap-7">
        <PageHeader
          headingId="overview-title"
          title="Übersicht"
          description="Planung, Anwesenheit und Familien auf einen Blick."
        />
        <div
          className="rounded-md border border-status-error/30 bg-status-error/5 p-4"
          role="alert"
        >
          <p className="font-semibold">Die Übersicht konnte nicht geladen werden.</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            className={`${buttonVariants({ variant: "secondary" })} mt-4`}
            onClick={() => void refresh()}
          >
            Erneut versuchen
          </button>
        </div>
      </section>
    );

  const now = Date.now();
  const eventGroups = data?.eventGroups ?? [];
  const shifts = eventGroups.flatMap(({ event, shifts: groupShifts }) =>
    groupShifts.map((shift) => ({ event, shift })),
  );
  const allUpcomingEvents = eventGroups
    .filter(
      ({ event }) =>
        !["CANCELLED", "COMPLETED"].includes(event.status) &&
        new Date(`${event.date}T23:59:59`).getTime() >= now,
    )
    .sort((a, b) => a.event.date.localeCompare(b.event.date));
  const allUpcomingShifts = shifts
    .filter(({ shift }) => shift.status !== "CANCELLED" && new Date(shift.ends_at).getTime() > now)
    .sort((a, b) => new Date(a.shift.starts_at).getTime() - new Date(b.shift.starts_at).getTime());
  const upcomingEvents = allUpcomingEvents.slice(0, 3);
  const upcomingShifts = allUpcomingShifts.slice(0, 3);
  const openPlaces = allUpcomingShifts.reduce((total, { shift }) => total + shift.open_places, 0);
  const attendanceAction = shifts
    .flatMap(({ event, shift }) =>
      shift.signups
        .filter((signup) => signup.outcome === "OPEN" && new Date(shift.ends_at).getTime() <= now)
        .map((signup) => ({ event, shift, signup })),
    )
    .sort((a, b) => new Date(b.shift.ends_at).getTime() - new Date(a.shift.ends_at).getTime());
  const base = `/${encodeURIComponent(org)}/admin`;

  return (
    <section aria-labelledby="overview-title" className="grid gap-7">
      <PageHeader
        headingId="overview-title"
        title="Übersicht"
        description="Planung, Anwesenheit und Familien auf einen Blick."
        action={
          <Link className={buttonVariants({ variant: "primary" })} href={`${base}/planning`}>
            Planung öffnen
          </Link>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Organisationsübersicht">
        <StatSummary
          label="Bevorstehende Anlässe"
          value={allUpcomingEvents.length}
          icon={<CalendarDays aria-hidden="true" />}
        />
        <StatSummary
          label="Bevorstehende Einsätze"
          value={allUpcomingShifts.length}
          icon={<CalendarDays aria-hidden="true" />}
        />
        <StatSummary label="Offene Plätze" value={openPlaces} icon={<Users aria-hidden="true" />} />
        <StatSummary
          label="Aktive Familien"
          value={data?.families ?? 0}
          icon={<Users aria-hidden="true" />}
        />
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <div className="grid gap-6">
          <OverviewList
            title="Nächste Anlässe"
            empty="Keine bevorstehenden Anlässe vorhanden."
            href={`${base}/planning`}
          >
            {upcomingEvents.map(({ event, shifts: eventShifts }) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 py-4 last:border-0"
                key={event.id}
              >
                <div>
                  <p className="font-semibold">{event.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(event.date, timezone)} · {event.location}
                  </p>
                </div>
                <Badge>{eventShifts.length} Einsätze</Badge>
              </li>
            ))}
          </OverviewList>
          <OverviewList
            title="Nächste Einsätze"
            empty="Keine bevorstehenden Einsätze vorhanden."
            href={`${base}/planning`}
          >
            {upcomingShifts.map(({ event, shift }) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 py-4 last:border-0"
                key={shift.id}
              >
                <div>
                  <p className="font-semibold">{event.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(shift.starts_at, timezone)}
                  </p>
                </div>
                <Badge variant={shift.open_places > 0 ? "warning" : "success"}>
                  {shift.open_places > 0 ? `${shift.open_places} Plätze offen` : "Besetzt"}
                </Badge>
              </li>
            ))}
          </OverviewList>
        </div>

        <div className="grid content-start gap-6">
          <OverviewList
            title="Handlungsbedarf Anwesenheit"
            empty="Keine offenen Anwesenheiten vorhanden."
            href={`${base}/attendance`}
          >
            {attendanceAction.slice(0, 4).map(({ event, shift, signup }) => (
              <li className="border-b border-border/70 py-4 last:border-0" key={signup.id}>
                <p className="font-semibold">{signup.public_name}</p>
                <p className="text-sm text-muted-foreground">
                  {event.title} · {formatDateTime(shift.ends_at, timezone)}
                </p>
              </li>
            ))}
          </OverviewList>
          <Card>
            <CardBody className="grid gap-3">
              <h2 className="text-lg font-semibold">Direktzugriff</h2>
              <QuickLink href={`${base}/planning`} icon={<CalendarDays aria-hidden="true" />}>
                Planung
              </QuickLink>
              <QuickLink href={`${base}/attendance`} icon={<ClipboardCheck aria-hidden="true" />}>
                Anwesenheit
              </QuickLink>
              <QuickLink href={`${base}/families`} icon={<Users aria-hidden="true" />}>
                Helfer
              </QuickLink>
            </CardBody>
          </Card>
        </div>
      </div>
    </section>
  );
}

function OverviewList({
  children,
  empty,
  href,
  title,
}: Readonly<{ children: ReactNode; empty: string; href: string; title: string }>) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={href}
          >
            Alle anzeigen
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
        {hasItems ? (
          <ul className="mt-2">{children}</ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
        )}
      </CardBody>
    </Card>
  );
}

function QuickLink({
  children,
  href,
  icon,
}: Readonly<{ children: ReactNode; href: string; icon: ReactNode }>) {
  return (
    <Link
      className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      {icon}
      {children}
      <ArrowRight aria-hidden="true" className="ml-auto" size={16} />
    </Link>
  );
}
