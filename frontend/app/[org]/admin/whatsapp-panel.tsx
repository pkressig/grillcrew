"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { loadAdminPlanningData } from "@/lib/admin-planning-data";
import type { PlanningEvent, Shift } from "@/lib/planning";
import { loadFamilyVolunteers, type FamilyVolunteer } from "@/lib/families";
import { localDateOf, occupancyStatus, type OccupancyStatus } from "@/lib/shift-coverage";
import { whatsAppHref } from "@/lib/phone";

const DAYS_AHEAD = 10;
const DEFAULT_TEMPLATE =
  "Hallo {Vorname}, uns fehlen noch Helfer für einen Einsatz. Hast du kurz Zeit, dir die offenen Termine anzuschauen? Danke dir!";

const statusVariant: Record<OccupancyStatus, BadgeProps["variant"]> = {
  FULL: "success",
  PARTIAL: "warning",
  NONE: "error",
  NOT_PLANNED: "neutral",
};

function dateHeading(value: string) {
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
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

function personalize(template: string, firstName: string): string {
  return template.replaceAll("{Vorname}", firstName);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type ShiftWithEvent = { shift: Shift; event: PlanningEvent | undefined };

function buildAiContext(gaps: ShiftWithEvent[], timezone: string): string {
  const lines = gaps.map(({ shift, event }) => {
    const type = shift.shift_type === "KIOSK" ? "Kiosk" : "Grill";
    const title = event ? event.title : "Unbekannter Anlass";
    return `- ${dateHeading(localDateOf(shift.starts_at, timezone))}, ${formatTime(shift.starts_at, timezone)}–${formatTime(shift.ends_at, timezone)} Uhr (${type}, ${title}): ${shift.occupied_volunteers} von ${shift.required_volunteers} Helfer, ${shift.open_places} ${shift.open_places === 1 ? "Platz offen" : "Plätze offen"}`;
  });
  const body =
    lines.length > 0
      ? lines.join("\n")
      : "Aktuell keine offenen Deckungslücken in den nächsten 10 Tagen.";
  return (
    `Kontext für einen WhatsApp-Textentwurf (Vereinshelden):\n` +
    `Offene Einsätze in den nächsten ${DAYS_AHEAD} Tagen:\n${body}\n\n` +
    `Bitte erstelle kurze, freundliche WhatsApp-Nachrichten auf Deutsch, um Helfer für diese ` +
    `Lücken zu gewinnen. Eine Version für eine Gruppen-Nachricht (alle Lücken zusammengefasst) ` +
    `und eine Version für eine persönliche Einzelnachricht mit dem Platzhalter {Vorname}.`
  );
}

export function WhatsAppPanel({ org, timezone }: Readonly<{ org: string; timezone: string }>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shiftsWithEvents, setShiftsWithEvents] = useState<ShiftWithEvent[]>([]);
  const [volunteers, setVolunteers] = useState<FamilyVolunteer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [groupMessage, setGroupMessage] = useState("");
  const [copiedGroup, setCopiedGroup] = useState(false);
  const [copiedContext, setCopiedContext] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([loadAdminPlanningData(org), loadFamilyVolunteers(org)])
      .then(([planning, loadedVolunteers]) => {
        if (!active) return;
        const eventById = new Map(planning.events.map((event) => [event.id, event]));
        setShiftsWithEvents(
          planning.shifts.map((shift) => ({ shift, event: eventById.get(shift.event_id) })),
        );
        setVolunteers(loadedVolunteers);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Die Daten für das WhatsApp-Zentrum konnten nicht geladen werden.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org]);

  const upcoming = useMemo(() => {
    const now = new Date();
    const horizon = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
    return shiftsWithEvents
      .filter(({ shift }) => shift.status !== "CANCELLED")
      .filter(({ shift }) => {
        const startsAt = new Date(shift.starts_at);
        return startsAt >= now && startsAt <= horizon;
      })
      .sort((left, right) => left.shift.starts_at.localeCompare(right.shift.starts_at));
  }, [shiftsWithEvents]);

  const gaps = useMemo(() => upcoming.filter(({ shift }) => shift.open_places > 0), [upcoming]);

  const days = useMemo(() => {
    const groups = new Map<string, ShiftWithEvent[]>();
    upcoming.forEach((entry) => {
      const day = localDateOf(entry.shift.starts_at, timezone);
      groups.set(day, [...(groups.get(day) ?? []), entry]);
    });
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [upcoming, timezone]);

  const filteredVolunteers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de-CH");
    return volunteers
      .filter((volunteer) => volunteer.is_grill_helper || volunteer.is_kiosk_helper)
      .filter(
        (volunteer) =>
          !query ||
          `${volunteer.first_name} ${volunteer.last_name}`
            .toLocaleLowerCase("de-CH")
            .includes(query),
      )
      .sort((left, right) => left.first_name.localeCompare(right.first_name, "de-CH"));
  }, [volunteers, search]);

  const selectedVolunteers = volunteers.filter((volunteer) => selectedIds.has(volunteer.id));

  function toggleVolunteer(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCopyGroup() {
    const copied = await copyToClipboard(groupMessage);
    setCopiedGroup(copied);
    if (copied) setTimeout(() => setCopiedGroup(false), 2500);
  }

  async function handleCopyContext() {
    const copied = await copyToClipboard(buildAiContext(gaps, timezone));
    setCopiedContext(copied);
    if (copied) setTimeout(() => setCopiedContext(false), 2500);
  }

  if (loading)
    return (
      <section aria-live="polite">
        <p>WhatsApp-Zentrum wird geladen …</p>
      </section>
    );

  return (
    <section className="grid gap-7" aria-labelledby="whatsapp-title">
      <PageHeader
        headingId="whatsapp-title"
        title="WhatsApp"
        description={`Deckungslücken der nächsten ${DAYS_AHEAD} Tage im Blick, Nachrichten vorbereiten und per WhatsApp versenden.`}
      />
      {error ? (
        <Card>
          <CardBody>
            <p role="alert" className="text-status-error">
              {error}
            </p>
          </CardBody>
        </Card>
      ) : null}

      <section aria-labelledby="whatsapp-gaps-title" className="grid gap-3">
        <h2 id="whatsapp-gaps-title" className="text-xl font-semibold">
          Offene Deckungslücken
          {gaps.length > 0 ? (
            <Badge className="ml-2" variant="error">
              {gaps.length}
            </Badge>
          ) : null}
        </h2>
        {days.length === 0 ? (
          <Card role="status">
            <CardBody>Keine Einsätze in den nächsten {DAYS_AHEAD} Tagen geplant.</CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {days.map(([day, entries]) => (
              <Card key={day}>
                <CardBody className="grid gap-3">
                  <h3 className="font-semibold capitalize">{dateHeading(day)}</h3>
                  <ul className="grid gap-2">
                    {entries.map(({ shift, event }) => {
                      const status = occupancyStatus(
                        shift.required_volunteers,
                        shift.occupied_volunteers,
                      );
                      return (
                        <li
                          key={shift.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {formatTime(shift.starts_at, timezone)}–
                              {formatTime(shift.ends_at, timezone)} Uhr ·{" "}
                              {shift.shift_type === "KIOSK" ? "Kiosk" : "Grill"}
                            </p>
                            <p className="text-muted-foreground">
                              {event ? event.title : "Unbekannter Anlass"}
                            </p>
                          </div>
                          <Badge variant={statusVariant[status]}>
                            {shift.occupied_volunteers} von {shift.required_volunteers} belegt
                            {shift.open_places > 0
                              ? ` · ${shift.open_places} ${shift.open_places === 1 ? "Platz offen" : "Plätze offen"}`
                              : ""}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="whatsapp-context-title" className="grid gap-2">
        <h2 id="whatsapp-context-title" className="text-xl font-semibold">
          KI-Unterstützung
        </h2>
        <p className="text-sm text-muted-foreground">
          Kopiert eine Zusammenfassung der offenen Lücken in die Zwischenablage — füge sie in Claude
          Code oder ChatGPT ein, um einen Textentwurf zu erhalten, und trage das Ergebnis unten in
          die Nachrichtenfelder ein.
        </p>
        <Button className="w-fit" variant="secondary" onClick={() => void handleCopyContext()}>
          {copiedContext ? "Kopiert!" : "KI-Kontext kopieren"}
        </Button>
      </section>

      <section aria-labelledby="whatsapp-group-title" className="grid gap-2">
        <h2 id="whatsapp-group-title" className="text-xl font-semibold">
          Gruppennachricht
        </h2>
        <p className="text-sm text-muted-foreground">
          WhatsApp erlaubt kein direktes Vorausfüllen einer bestehenden Gruppe — Text hier
          vorbereiten, kopieren und in der Gruppe selbst einfügen.
        </p>
        <label className="grid gap-1" htmlFor="whatsapp-group-message">
          <span className="sr-only">Gruppennachricht</span>
          <textarea
            id="whatsapp-group-message"
            className="min-h-28 rounded-md border bg-background p-3 text-sm"
            value={groupMessage}
            onChange={(event) => setGroupMessage(event.target.value)}
            placeholder="Nachricht für den Gruppenchat …"
          />
        </label>
        <Button
          className="w-fit"
          variant="secondary"
          disabled={!groupMessage.trim()}
          onClick={() => void handleCopyGroup()}
        >
          {copiedGroup ? "Kopiert!" : "In Zwischenablage kopieren"}
        </Button>
      </section>

      <section aria-labelledby="whatsapp-individual-title" className="grid gap-3">
        <h2 id="whatsapp-individual-title" className="text-xl font-semibold">
          Einzelnachrichten
        </h2>
        <label className="grid gap-1" htmlFor="whatsapp-template">
          <span className="text-sm font-medium">
            Vorlage (Platzhalter <code>{"{Vorname}"}</code> wird ersetzt)
          </span>
          <textarea
            id="whatsapp-template"
            className="min-h-24 rounded-md border bg-background p-3 text-sm"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
          />
        </label>
        <label className="grid gap-1" htmlFor="whatsapp-volunteer-search">
          <span className="text-sm font-medium">Helfer suchen</span>
          <input
            id="whatsapp-volunteer-search"
            className="min-h-11 rounded-md border bg-background px-3"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name eingeben …"
          />
        </label>
        <ul
          className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2"
          aria-label="Helferauswahl"
        >
          {filteredVolunteers.length === 0 ? (
            <li className="p-2 text-sm text-muted-foreground">Keine Helfer gefunden.</li>
          ) : (
            filteredVolunteers.map((volunteer) => (
              <li key={volunteer.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-md p-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={selectedIds.has(volunteer.id)}
                    onChange={() => toggleVolunteer(volunteer.id)}
                  />
                  <span className="flex-1">
                    {volunteer.first_name} {volunteer.last_name}
                  </span>
                  {volunteer.is_grill_helper ? <Badge variant="neutral">Grill</Badge> : null}
                  {volunteer.is_kiosk_helper ? <Badge variant="neutral">Kiosk</Badge> : null}
                </label>
              </li>
            ))
          )}
        </ul>
        {selectedVolunteers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Wähle oben Helfer aus, um personalisierte WhatsApp-Links zu erhalten.
          </p>
        ) : (
          <ul className="grid gap-2">
            {selectedVolunteers.map((volunteer) => {
              const personalized = personalize(template, volunteer.first_name);
              return (
                <li
                  key={volunteer.id}
                  className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium">
                      {volunteer.first_name} {volunteer.last_name}
                    </p>
                    <p className="text-muted-foreground">{personalized}</p>
                  </div>
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary bg-primary px-4 font-medium text-primary-foreground hover:opacity-90"
                    href={whatsAppHref(volunteer.phone, personalized)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Per WhatsApp senden
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
