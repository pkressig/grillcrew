"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { useOrganization } from "@/components/organization-provider";
import {
  createPublicSignup,
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
export function OrganizationLanding() {
  const organization = useOrganization();
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [error, setError] = useState(false);
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [formStartedAt, setFormStartedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; managementUrl: string | null } | null>(
    null,
  );

  function openSignup(shiftId: string) {
    setSelectedShift(shiftId);
    setFormStartedAt(new Date().toISOString());
    setSignupError(null);
    setSuccess(null);
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>, shiftId: string) {
    event.preventDefault();
    setSubmitting(true);
    setSignupError(null);
    const data = new FormData(event.currentTarget);
    try {
      const result = await createPublicSignup(organization.slug, shiftId, {
        first_name: String(data.get("first_name") ?? ""),
        last_name: String(data.get("last_name") ?? ""),
        phone: String(data.get("phone") ?? ""),
        email: String(data.get("email") ?? ""),
        public_display_consent: data.get("public_display_consent") === "on",
        website: String(data.get("website") ?? ""),
        form_started_at: formStartedAt,
      });
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
            {success ? (
              <div
                role="status"
                className="flex items-start justify-between gap-3 rounded-xl bg-green-100 p-4 font-semibold text-green-900"
              >
                <div>
                  <p>{success.message} Dein Platz ist reserviert.</p>
                  {success.managementUrl ? (
                    <>
                      <a
                        href={success.managementUrl}
                        className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-green-900 px-4 text-white hover:bg-green-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-900"
                      >
                        Meine Eintragung öffnen
                      </a>
                      <p className="mt-2 text-sm font-normal text-green-950">
                        Wichtig: Da der E-Mail-Versand noch nicht aktiv ist, speichere oder öffne
                        diesen Link jetzt. Damit kannst du deine Eintragung später ansehen oder
                        rechtzeitig absagen.
                      </p>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSuccess(null)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-green-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-900"
                  aria-label="Hinweis schliessen"
                >
                  ✕
                </button>
              </div>
            ) : null}
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
                          aria-label={`Einsatz ${formatTime(shift.starts_at, organization.timezone)} bis ${formatTime(shift.ends_at, organization.timezone)} Uhr`}
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
                          {shift.volunteer_names.length > 0 ? (
                            <p className="mt-3 text-sm">
                              Eingetragen: {shift.volunteer_names.join(", ")}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            disabled={shift.status !== "OPEN" || full}
                            onClick={() => openSignup(shift.id)}
                            aria-label={`Eintragen: ${event.title}, ${formatTime(shift.starts_at, organization.timezone)} bis ${formatTime(shift.ends_at, organization.timezone)} Uhr`}
                            className="mt-4 min-h-11 w-full rounded-lg border px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {shift.status !== "OPEN"
                              ? "Geschlossen"
                              : full
                                ? "Besetzt"
                                : "Eintragen"}
                          </button>
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
                                  Alle Angaben sind Pflichtfelder.
                                </p>
                              </div>
                              <SignupField
                                id={`first_name-${shift.id}`}
                                name="first_name"
                                label="Vorname"
                              />
                              <SignupField
                                id={`last_name-${shift.id}`}
                                name="last_name"
                                label="Nachname"
                              />
                              <SignupField
                                id={`phone-${shift.id}`}
                                name="phone"
                                label="Telefon"
                                type="tel"
                              />
                              <SignupField
                                id={`email-${shift.id}`}
                                name="email"
                                label="E-Mail"
                                type="email"
                              />
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
                                  Ich bin einverstanden, dass mein Vor- und Nachname im öffentlichen
                                  Einsatzplan angezeigt wird. Telefonnummer und E-Mail sehen nur
                                  berechtigte Verantwortliche.
                                </span>
                              </label>
                              {signupError ? (
                                <p role="alert" className="text-sm text-red-700">
                                  {signupError}
                                </p>
                              ) : null}
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                  type="submit"
                                  disabled={submitting}
                                  className="min-h-11 flex-1 rounded-lg bg-foreground px-4 font-semibold text-background disabled:opacity-60"
                                >
                                  {submitting ? "Wird eingetragen …" : "Verbindlich eintragen"}
                                </button>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => setSelectedShift(null)}
                                  className="min-h-11 rounded-lg border bg-background px-4 font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                                >
                                  Abbrechen
                                </button>
                              </div>
                            </form>
                          ) : null}
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

function SignupField({
  id,
  name,
  label,
  type = "text",
}: Readonly<{ id?: string; name: string; label: string; type?: string }>) {
  return (
    <label htmlFor={id} className="block text-sm font-semibold">
      {label}
      <input
        id={id}
        className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 font-normal text-base"
        name={name}
        type={type}
        required
      />
    </label>
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
