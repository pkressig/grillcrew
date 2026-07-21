"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { useOrganization } from "@/components/organization-provider";
import { fetchPublicPlan, type PublicPlan } from "@/lib/public-plan";

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export function OrganizationLanding() {
  const organization = useOrganization();
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadPlan() {
      try {
        const result = await fetchPublicPlan(organization.slug, controller.signal);
        if (active) setPlan(result);
      } catch {
        if (active) setError(true);
      }
    }
    void loadPlan();
    return () => {
      active = false;
      controller.abort();
    };
  }, [organization.slug]);

  const summary = useMemo(() => {
    const shifts = plan?.events.flatMap((event) => event.shifts) ?? [];
    return {
      shifts: shifts.length,
      places: shifts.reduce(
        (total, shift) =>
          total +
          (shift.status === "OPEN" ? shift.required_volunteers - shift.occupied_volunteers : 0),
        0,
      ),
    };
  }, [plan]);

  return (
    <main className="min-h-dvh bg-muted/60 pb-10">
      <header
        className="border-b bg-background px-4 py-5"
        style={{ borderColor: organization.theme.secondary_color }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {organization.theme.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="h-12 w-12 rounded-lg object-contain"
              src={organization.theme.logo_url}
              alt=""
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-12 w-12 rounded-lg"
              style={{ backgroundColor: organization.theme.primary_color }}
            />
          )}
          <div>
            <p className="text-sm font-semibold text-muted-foreground">GrillCrew · Einsatzplan</p>
            <h1 className="text-xl font-bold sm:text-2xl">{organization.name}</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {error ? (
          <StateMessage title="Plan nicht verfügbar">
            Bitte versuche es später nochmals.
          </StateMessage>
        ) : plan === null ? (
          <div role="status" className="rounded-2xl border bg-background p-6 text-center">
            Einsatzplan wird geladen …
          </div>
        ) : plan.events.length === 0 ? (
          <StateMessage title="Noch keine Einsätze">
            Zurzeit sind keine kommenden Einsätze veröffentlicht.
          </StateMessage>
        ) : (
          <>
            <section aria-label="Übersicht" className="grid grid-cols-2 gap-3">
              <Summary value={summary.shifts} label="kommende Einsätze" />
              <Summary value={summary.places} label="offene Plätze" />
            </section>
            <section aria-label="Kommende Anlässe" className="space-y-5">
              {plan.events.map((event) => (
                <article
                  key={event.id}
                  className="overflow-hidden rounded-2xl border bg-background shadow-sm"
                >
                  <div className="border-b p-5">
                    <p className="text-sm font-semibold text-muted-foreground">
                      {event.event_type}
                    </p>
                    <h2 className="mt-1 text-xl font-bold">{event.title}</h2>
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="flex items-center gap-2">
                        <CalendarDays aria-hidden="true" className="h-4 w-4" />
                        {dateFormatter.format(new Date(`${event.date}T00:00:00Z`))}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin aria-hidden="true" className="h-4 w-4" />
                        {event.location}
                      </p>
                    </div>
                    {event.public_description ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {event.public_description}
                      </p>
                    ) : null}
                  </div>
                  <div className="divide-y">
                    {event.shifts.map((shift) => {
                      const remaining = Math.max(
                        shift.required_volunteers - shift.occupied_volunteers,
                        0,
                      );
                      const full = remaining === 0;
                      const label =
                        shift.status === "CLOSED" ? "Geschlossen" : full ? "Besetzt" : "Offen";
                      return (
                        <section
                          key={shift.id}
                          aria-label={`Einsatz ${formatTime(shift.starts_at, organization.timezone)} bis ${formatTime(shift.ends_at, organization.timezone)}`}
                          className="p-5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 font-bold">
                                <Clock3 aria-hidden="true" className="h-5 w-5" />
                                {formatTime(shift.starts_at, organization.timezone)}–
                                {formatTime(shift.ends_at, organization.timezone)} Uhr
                              </p>
                              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                                <Users aria-hidden="true" className="h-4 w-4" />
                                {shift.occupied_volunteers} von {shift.required_volunteers} Plätzen
                                besetzt
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-semibold ${label === "Offen" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700"}`}
                            >
                              {label}
                            </span>
                          </div>
                          {shift.public_note ? (
                            <p className="mt-3 text-sm">{shift.public_note}</p>
                          ) : null}
                          <button
                            disabled
                            aria-label={`Bald eintragen: ${event.title}, ${formatTime(shift.starts_at, organization.timezone)} bis ${formatTime(shift.ends_at, organization.timezone)} Uhr`}
                            className="mt-4 min-h-11 w-full cursor-not-allowed rounded-lg border px-4 font-semibold opacity-60"
                          >
                            Bald eintragen
                          </button>
                        </section>
                      );
                    })}
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}
function Summary({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <strong className="block text-2xl">{value}</strong>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
export function StateMessage({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-2xl border bg-background p-7 text-center">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </section>
  );
}
