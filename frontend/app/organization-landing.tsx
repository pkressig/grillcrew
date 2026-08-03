"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useOrganization } from "@/components/organization-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { fetchVolunteerProfile, type VolunteerProfile } from "@/lib/volunteer-profile";
import {
  createAuthenticatedSignup,
  fetchPublicPlan,
  PublicSignupError,
  type PublicPlan,
} from "@/lib/public-plan";

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dateTileMonthFormatter = new Intl.DateTimeFormat("de-CH", {
  month: "short",
  timeZone: "UTC",
});
const dateTileDayFormatter = new Intl.DateTimeFormat("de-CH", {
  day: "2-digit",
  timeZone: "UTC",
});
export function OrganizationLanding() {
  const organization = useOrganization();
  const auth = useAuth();
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [error, setError] = useState(false);
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; managementUrl: string | null } | null>(
    null,
  );
  const [volunteerProfile, setVolunteerProfile] = useState<VolunteerProfile | null>(null);

  function openSignup(shiftId: string) {
    setSelectedShift(shiftId);
    setSignupError(null);
    setSuccess(null);
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>, shiftId: string) {
    event.preventDefault();
    setSubmitting(true);
    setSignupError(null);
    try {
      const result = await createAuthenticatedSignup(organization.slug, shiftId);
      if (result.signup) {
        setPlan((current) =>
          current
            ? {
                events: current.events.map((eventItem) => ({
                  ...eventItem,
                  shifts: eventItem.shifts.map((shift) =>
                    shift.id === shiftId
                      ? {
                          ...shift,
                          occupied_volunteers: result.signup!.occupied_volunteers,
                          volunteer_names: [...shift.volunteer_names, result.signup!.public_name],
                        }
                      : shift,
                  ),
                })),
              }
            : current,
        );
      }
      setSuccess({ message: result.message, managementUrl: result.management_url });
      setSelectedShift(null);
    } catch (err) {
      if (err instanceof PublicSignupError) {
        if (err.statusCode === 409) {
          setSignupError("Diese Schicht ist leider bereits ausgebucht oder nicht mehr verfügbar.");
        } else if (err.statusCode === 429) {
          setSignupError(
            "Zu viele Anfragen. Bitte warte einen kurzen Moment und versuche es nochmals.",
          );
        } else if (err.message === "csrf validation failed") {
          setSignupError("Die Sitzung ist abgelaufen. Bitte lade die Seite neu und versuche es nochmals.");
        } else {
          setSignupError(
            "Die Eintragung ist nicht gelungen. Bitte prüfe deine Angaben und versuche es nochmals.",
          );
        }
      } else {
        setSignupError(
          "Die Eintragung ist nicht gelungen. Bitte prüfe deine Angaben und versuche es nochmals.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

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

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setVolunteerProfile(null);
      return;
    }
    void fetchVolunteerProfile()
      .then(setVolunteerProfile)
      .catch(() => setVolunteerProfile(null));
  }, [auth.isAuthenticated]);

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
        <div className="mx-auto flex max-w-4xl items-center gap-3">
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
            <p className="text-sm font-semibold text-muted-foreground">Öffentlicher Einsatzplan</p>
            <h1 className="text-xl font-bold sm:text-2xl">{organization.name}</h1>
          </div>
          <nav className="ml-auto flex items-center gap-2" aria-label="Konto">
            {auth.isAuthenticated ? (
              <>
                <Link
                  className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
                  href="/profile"
                >
                  Mein Profil
                </Link>
              </>
            ) : (
              <>
                <a
                  className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
                  href={`/login?org=${encodeURIComponent(organization.slug)}`}
                >
                  Login
                </a>
                <a
                  className={cn(buttonVariants(), "min-h-11")}
                  href={`/register?org=${encodeURIComponent(organization.slug)}`}
                >
                  Registrieren
                </a>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Kommende Einsätze"
          description={`Wähle einen Einsatz bei ${organization.name} und melde dich direkt an.`}
        />
        {error ? (
          <StateMessage title="Plan nicht verfügbar">
            Bitte versuche es später nochmals.
          </StateMessage>
        ) : plan === null ? (
          <Card role="status" aria-live="polite">
            <CardBody className="text-center text-muted-foreground">
              Einsatzplan wird geladen …
            </CardBody>
          </Card>
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
            {success ? (
              <div
                role="status"
                className="flex items-start justify-between gap-3 rounded-md border border-status-success/30 bg-status-success/10 p-4 font-semibold text-status-success"
              >
                <div>
                  <p>{success.message} Dein Platz ist reserviert.</p>
                  {success.managementUrl ? (
                    <>
                      <a href={success.managementUrl} className={cn(buttonVariants(), "mt-3")}>
                        Meine Eintragung öffnen
                      </a>
                      <p className="mt-2 text-sm font-normal text-foreground">
                        Wir haben dir eine Bestätigung per E-Mail gesendet. Speichere oder öffne
                        diesen Link trotzdem jetzt – die E-Mail kann verspätet eintreffen oder im
                        Spam-Ordner landen. Damit kannst du deine Eintragung später ansehen oder
                        rechtzeitig absagen.
                      </p>
                    </>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setSuccess(null)}
                  className="min-w-11 shrink-0 px-0"
                  aria-label="Hinweis schliessen"
                >
                  ✕
                </Button>
              </div>
            ) : null}
            <section aria-label="Kommende Anlässe" className="space-y-5">
              {plan.events.map((event) => (
                <Card key={event.id} className="overflow-hidden">
                  <article aria-labelledby={`event-${event.id}-title`}>
                    <CardHeader className="border-b border-border/70 pb-5">
                      <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-3 sm:gap-4">
                        <time
                          dateTime={event.date}
                          aria-label={dateFormatter.format(new Date(`${event.date}T00:00:00Z`))}
                          className="flex w-16 shrink-0 flex-col overflow-hidden rounded-md border border-primary/30 bg-primary/5 text-center"
                        >
                          <span className="bg-primary px-2 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                            {dateTileMonthFormatter.format(new Date(`${event.date}T00:00:00Z`))}
                          </span>
                          <span className="px-2 py-2 text-2xl font-bold leading-none">
                            {dateTileDayFormatter.format(new Date(`${event.date}T00:00:00Z`))}
                          </span>
                        </time>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-muted-foreground">
                            {event.event_type}
                          </p>
                          <h2 id={`event-${event.id}-title`} className="mt-1 text-xl font-bold">
                            {event.title}
                          </h2>
                          <p className="mt-2 flex items-start gap-2 text-sm">
                            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0" />
                            {dateFormatter.format(new Date(`${event.date}T00:00:00Z`))}
                          </p>
                          <p className="mt-1 flex items-start gap-2 text-sm">
                            <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="min-w-0 break-words">{event.location}</span>
                          </p>
                        </div>
                      </div>
                      {event.public_description ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          {event.public_description}
                        </p>
                      ) : null}
                    </CardHeader>
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
                            aria-labelledby={`shift-${shift.id}-title`}
                            className="p-5"
                          >
                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                              <div className="min-w-0">
                                <h3
                                  id={`shift-${shift.id}-title`}
                                  className="flex items-center gap-2 font-bold"
                                >
                                  <Clock3 aria-hidden="true" className="h-5 w-5" />
                                  {formatTime(shift.starts_at, organization.timezone)}–
                                  {formatTime(shift.ends_at, organization.timezone)} Uhr
                                </h3>
                                <p
                                  id={`shift-${shift.id}-capacity`}
                                  className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
                                >
                                  <Users aria-hidden="true" className="h-4 w-4" />
                                  {shift.occupied_volunteers} von {shift.required_volunteers}{" "}
                                  Plätzen besetzt
                                </p>
                              </div>
                              <Badge
                                id={`shift-${shift.id}-status`}
                                variant={label === "Offen" ? "success" : "neutral"}
                                className="w-fit"
                              >
                                {label}
                              </Badge>
                            </div>
                            {shift.public_note ? (
                              <p className="mt-3 text-sm">{shift.public_note}</p>
                            ) : null}
                            {shift.volunteer_names.length > 0 ? (
                              <p className="mt-3 text-sm">
                                Eingetragen: {shift.volunteer_names.join(", ")}
                              </p>
                            ) : null}
                            <Button
                              type="button"
                              disabled={shift.status !== "OPEN" || full}
                              onClick={() => {
                                if (!auth.isAuthenticated) {
                                  window.location.href = `/login?org=${encodeURIComponent(organization.slug)}&next=/${encodeURIComponent(organization.slug)}`;
                                  return;
                                }
                                openSignup(shift.id);
                              }}
                              aria-label={`Eintragen: ${event.title}, ${formatTime(shift.starts_at, organization.timezone)} bis ${formatTime(shift.ends_at, organization.timezone)} Uhr`}
                              aria-describedby={`shift-${shift.id}-capacity shift-${shift.id}-status`}
                              className="mt-4 w-full"
                            >
                              {shift.status !== "OPEN"
                                ? "Geschlossen"
                                : full
                                  ? "Besetzt"
                                  : auth.isAuthenticated
                                    ? "Einsatz anmelden"
                                    : "Anmelden und Einsatz wählen"}
                            </Button>
                            {selectedShift === shift.id ? (
                              <form
                                aria-label={`Eintragung für ${event.title}, ${formatTime(shift.starts_at, organization.timezone)} Uhr`}
                                className="mt-4 space-y-3 rounded-xl bg-muted/60 p-4"
                                onSubmit={(formEvent) => void submitSignup(formEvent, shift.id)}
                              >
                                <div className="border-b pb-2">
                                  <h3 className="text-base font-bold text-foreground">
                                    Eintragung für{" "}
                                    {formatTime(shift.starts_at, organization.timezone)}–
                                    {formatTime(shift.ends_at, organization.timezone)} Uhr
                                  </h3>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Bitte prüfe deine Angaben und bestätige die verbindliche
                                    Anmeldung.
                                  </p>
                                </div>
                                {volunteerProfile ? (
                                  <div className="space-y-2 rounded-lg border bg-background p-3 text-sm">
                                    <p className="font-semibold">Deine Anmeldedaten</p>
                                    <p>
                                      {volunteerProfile.first_name} {volunteerProfile.last_name}
                                    </p>
                                    <p className="text-muted-foreground">
                                      {volunteerProfile.phone} · {volunteerProfile.email}
                                    </p>
                                    <p className="text-muted-foreground">
                                      Vergütung:{" "}
                                      {compensationLabel(volunteerProfile.compensation_preference)}
                                    </p>
                                    <Link className="underline" href="/profile">
                                      Profil bearbeiten
                                    </Link>
                                  </div>
                                ) : (
                                  <p role="status" className="text-sm text-muted-foreground">
                                    Profildaten werden geladen …
                                  </p>
                                )}
                                <div hidden aria-hidden="true" style={{ display: "none" }}>
                                  <label htmlFor={`website-${shift.id}`}>Website</label>
                                  <input
                                    id={`website-${shift.id}`}
                                    name="website"
                                    tabIndex={-1}
                                    autoComplete="off"
                                  />
                                </div>
                                <label className="flex min-h-11 items-start gap-3 text-sm">
                                  <input
                                    className="mt-1 h-5 w-5 shrink-0"
                                    type="checkbox"
                                    name="public_display_consent"
                                    required
                                  />
                                  <span>
                                    Ich bestätige die verbindliche Anmeldung mit den oben
                                    aufgeführten Profildaten. Telefonnummer und E-Mail sehen nur
                                    berechtigte Verantwortliche.
                                  </span>
                                </label>
                                {signupError ? (
                                  <p role="alert" className="text-sm text-status-error">
                                    {signupError}
                                  </p>
                                ) : null}
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <Button
                                    type="submit"
                                    disabled={submitting || !volunteerProfile}
                                    className="flex-1"
                                  >
                                    {submitting ? "Wird eingetragen …" : "Verbindlich eintragen"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={submitting}
                                    onClick={() => setSelectedShift(null)}
                                  >
                                    Abbrechen
                                  </Button>
                                </div>
                              </form>
                            ) : null}
                          </section>
                        );
                      })}
                    </div>
                  </article>
                </Card>
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
function compensationLabel(value: VolunteerProfile["compensation_preference"]) {
  if (value === "VOLUNTARY") return "Unentgeltlich";
  if (value === "PAYOUT") return "Bezahlt";
  return "Sollstunden";
}
function Summary({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <Card>
      <CardBody className="p-4">
        <strong className="block text-2xl">{value}</strong>
        <span className="text-sm text-muted-foreground">{label}</span>
      </CardBody>
    </Card>
  );
}
export function StateMessage({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Card>
      <CardBody className="p-7 text-center">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-2 text-muted-foreground">{children}</p>
      </CardBody>
    </Card>
  );
}
