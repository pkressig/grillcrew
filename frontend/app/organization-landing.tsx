"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock3, MapPin, Users, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useOrganization } from "@/components/organization-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { LogoutButton } from "@/components/logout-button";
import { apiBaseUrl } from "@/lib/api";
import { RegisterForm } from "./register/register-form";
import {
  fetchVolunteerProfile,
  type VolunteerProfile,
  type VolunteerSignupSummary,
} from "@/lib/volunteer-profile";
import {
  createAuthenticatedSignup,
  fetchPublicPlan,
  PublicSignupError,
  type PublicPlan,
  type PublicPlanEvent,
  type PublicShift,
} from "@/lib/public-plan";

type PlanView = "cards" | "compact" | "details";
type DayGroup = { date: string; events: PublicPlanEvent[] };

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFormatter = new Intl.DateTimeFormat("de-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function OrganizationLanding() {
  const organization = useOrganization();
  const auth = useAuth();
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<PlanView>("cards");
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [highlightedShift, setHighlightedShift] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; managementUrl: string | null } | null>(
    null,
  );
  const [volunteerProfile, setVolunteerProfile] = useState<VolunteerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [accountModal, setAccountModal] = useState<"login" | "register" | null>(null);
  const [pendingShiftId, setPendingShiftId] = useState<string | null>(null);
  const [registerOpened, setRegisterOpened] = useState(false);

  const storageKey = `grillcrew:public-plan-view:${organization.slug}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "cards" || saved === "compact" || saved === "details") setView(saved);
    } catch {
      // Storage can be unavailable in privacy-focused browsers.
    }
  }, [storageKey]);

  function selectView(nextView: PlanView) {
    setView(nextView);
    try {
      window.localStorage.setItem(storageKey, nextView);
    } catch {
      // The view still works for the current visit.
    }
  }

  function openRegister() {
    setRegisterOpened(true);
    setAccountModal("register");
  }

  function openSignup(shiftId: string) {
    setSelectedShift(shiftId);
    setSignupError(null);
    setSuccess(null);
  }

  function handleAccountSuccess() {
    setAccountModal(null);
    void auth.refresh().then(() => {
      if (pendingShiftId) {
        openSignup(pendingShiftId);
        setPendingShiftId(null);
      }
    });
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
      setHighlightedShift(shiftId);
      void fetchVolunteerProfile()
        .then(setVolunteerProfile)
        .catch(() => undefined);
    } catch (err) {
      if (err instanceof PublicSignupError && err.statusCode === 409) {
        setSignupError("Diese Schicht ist leider bereits ausgebucht oder nicht mehr verfügbar.");
      } else if (err instanceof PublicSignupError && err.statusCode === 429) {
        setSignupError(
          "Zu viele Anfragen. Bitte warte einen kurzen Moment und versuche es nochmals.",
        );
      } else if (err instanceof PublicSignupError && err.message === "csrf validation failed") {
        setSignupError(
          "Die Sitzung ist abgelaufen. Bitte lade die Seite neu und versuche es nochmals.",
        );
      } else {
        setSignupError("Die Eintragung ist nicht gelungen. Bitte versuche es nochmals.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetchPublicPlan(organization.slug, controller.signal)
      .then((result) => active && setPlan(result))
      .catch(() => active && setError(true));
    return () => {
      active = false;
      controller.abort();
    };
  }, [organization.slug]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setVolunteerProfile(null);
      setProfileLoaded(false);
      return;
    }
    setProfileLoaded(false);
    void fetchVolunteerProfile()
      .then(setVolunteerProfile)
      .catch(() => setVolunteerProfile(null))
      .finally(() => setProfileLoaded(true));
  }, [auth.isAuthenticated]);

  const days = useMemo(() => groupByDay(plan?.events ?? []), [plan]);
  const ownShiftIds = useMemo(() => {
    const ids = new Set<string>();
    if (!volunteerProfile || !plan) return ids;
    for (const signup of volunteerProfile.upcoming_signups) {
      const match = findSignupShift(plan, signup);
      if (match) ids.add(match.shift.id);
    }
    return ids;
  }, [plan, volunteerProfile]);
  const summary = useMemo(() => {
    const shifts = plan?.events.flatMap((event) => event.shifts) ?? [];
    return {
      shifts: shifts.length,
      places: shifts.reduce(
        (total, shift) =>
          total +
          (shift.status === "OPEN"
            ? Math.max(shift.required_volunteers - shift.occupied_volunteers, 0)
            : 0),
        0,
      ),
    };
  }, [plan]);

  function focusOwnSignup(signup: VolunteerSignupSummary) {
    if (!plan) return;
    const match = findSignupShift(plan, signup);
    if (!match) return;
    setHighlightedShift(match.shift.id);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`shift-${match.shift.id}`);
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }

  const shiftProps = {
    organizationTimezone: organization.timezone,
    authIsAuthenticated: auth.isAuthenticated,
    ownShiftIds,
    selectedShift,
    highlightedShift,
    volunteerProfile,
    submitting,
    signupError,
    onChoose: (shiftId: string) => {
      if (!auth.isAuthenticated) {
        setPendingShiftId(shiftId);
        setAccountModal("login");
      } else {
        openSignup(shiftId);
      }
    },
    onCancel: () => setSelectedShift(null),
    onSubmit: submitSignup,
  };

  return (
    <main className="min-h-dvh bg-muted/60 pb-10">
      <header
        className="border-b bg-background px-4 py-4"
        style={{ borderColor: organization.theme.secondary_color }}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          {organization.theme.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="h-11 w-11 rounded-lg object-contain"
              src={organization.theme.logo_url}
              alt=""
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-11 w-11 rounded-lg"
              style={{ backgroundColor: organization.theme.primary_color }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground">Öffentlicher Einsatzplan</p>
            <h1 className="truncate text-xl font-bold">{organization.name}</h1>
          </div>
          <nav className="flex items-center gap-2" aria-label="Konto">
            {auth.isAuthenticated ? (
              <>
                <Link
                  className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
                  href="/profile"
                >
                  Mein Profil
                </Link>
                <LogoutButton redirectTo={`/${organization.slug}`} />
              </>
            ) : (
              <>
                <a
                  href="#login"
                  className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
                  onClick={(event) => {
                    event.preventDefault();
                    setAccountModal("login");
                  }}
                >
                  Login
                </a>
                <a
                  href="#register"
                  className={cn(buttonVariants(), "min-h-11")}
                  onClick={(event) => {
                    event.preventDefault();
                    openRegister();
                  }}
                >
                  Registrieren
                </a>
              </>
            )}
          </nav>
        </div>
      </header>

      <AccountModal
        mode={accountModal}
        registerOpened={registerOpened}
        organization={organization}
        onClose={() => {
          setAccountModal(null);
          setPendingShiftId(null);
        }}
        onSuccess={handleAccountSuccess}
        onRegister={openRegister}
        onLogin={() => setAccountModal("login")}
      />

      <div className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-6 sm:py-8">
        {auth.isAuthenticated ? (
          <OwnSignups profile={volunteerProfile} loaded={profileLoaded} onSelect={focusOwnSignup} />
        ) : null}
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
            <section aria-label="Übersicht" className="grid grid-cols-2 gap-2">
              <Summary value={summary.shifts} label="kommende Einsätze" />
              <Summary value={summary.places} label="offene Plätze" />
            </section>
            <ViewSwitcher view={view} onChange={selectView} />
            {success ? <SuccessMessage success={success} onClose={() => setSuccess(null)} /> : null}
            <section aria-label="Kommende Anlässe" className="space-y-4">
              {days.map((day) => (
                <Day key={day.date} day={day} view={view} shiftProps={shiftProps} />
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ViewSwitcher({
  view,
  onChange,
}: Readonly<{ view: PlanView; onChange: (view: PlanView) => void }>) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      role="group"
      aria-label="Planansicht"
    >
      {(
        [
          ["cards", "Karten"],
          ["compact", "Kompakte Liste"],
          ["details", "Details"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={cn(
            "min-h-11 rounded-md px-2 text-sm font-semibold",
            view === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OwnSignups({
  profile,
  loaded,
  onSelect,
}: Readonly<{
  profile: VolunteerProfile | null;
  loaded: boolean;
  onSelect: (entry: VolunteerSignupSummary) => void;
}>) {
  return (
    <section aria-labelledby="own-signups-title" className="rounded-xl border bg-background p-3">
      <h2 id="own-signups-title" className="font-bold">
        Meine kommenden Einsätze
      </h2>
      {!loaded ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Einsätze werden geladen …
        </p>
      ) : !profile || profile.upcoming_signups.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Du hast noch keine kommenden Einsätze.</p>
      ) : (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {profile.upcoming_signups.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="min-h-11 w-full rounded-lg border p-3 text-left hover:bg-muted/60"
              >
                <span className="block font-semibold">{entry.event_title}</span>
                <span className="block text-sm">
                  {shortDateFormatter.format(new Date(`${entry.event_date}T00:00:00Z`))} ·{" "}
                  {formatTime(entry.shift_starts_at, "Europe/Zurich")}–
                  {formatTime(entry.shift_ends_at, "Europe/Zurich")} Uhr
                </span>
                <span className="block text-sm text-muted-foreground">
                  {entry.event_location} · Status: {signupStatus(entry)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Day({
  day,
  view,
  shiftProps,
}: Readonly<{ day: DayGroup; view: PlanView; shiftProps: ShiftProps }>) {
  const shifts = day.events
    .flatMap((event) => event.shifts.map((shift) => ({ event, shift })))
    .sort((a, b) => a.shift.starts_at.localeCompare(b.shift.starts_at));
  if (view === "details")
    return (
      <details className="rounded-xl border bg-background" open>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between p-4 font-bold">
          <span>{dateFormatter.format(new Date(`${day.date}T00:00:00Z`))}</span>
          <ChevronDown aria-hidden="true" className="h-5 w-5" />
        </summary>
        <div className="border-t p-4">
          <h3 className="font-semibold">Spiele und Anlässe</h3>
          <ul className="mt-2 space-y-2">
            {day.events.map((event) => (
              <li key={event.id}>
                <p className="font-semibold">{event.title}</p>
                <p className="text-sm text-muted-foreground">
                  {event.event_type} · {event.location}
                </p>
                {event.public_description ? (
                  <p className="text-sm">{event.public_description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="divide-y border-t">
          {shifts.map(({ event, shift }) => (
            <Shift key={shift.id} event={event} shift={shift} compact={false} {...shiftProps} />
          ))}
        </div>
      </details>
    );
  return (
    <Card>
      <CardHeader className="border-b p-4">
        <time dateTime={day.date} className="font-bold">
          {dateFormatter.format(new Date(`${day.date}T00:00:00Z`))}
        </time>
        {view === "cards" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {day.events.map((event) => event.title).join(" · ")}
          </p>
        ) : null}
      </CardHeader>
      <div className="divide-y">
        {shifts.map(({ event, shift }) => (
          <Shift
            key={shift.id}
            event={event}
            shift={shift}
            compact={view === "compact"}
            {...shiftProps}
          />
        ))}
      </div>
    </Card>
  );
}

type ShiftProps = {
  organizationTimezone: string;
  authIsAuthenticated: boolean;
  ownShiftIds: Set<string>;
  selectedShift: string | null;
  highlightedShift: string | null;
  volunteerProfile: VolunteerProfile | null;
  submitting: boolean;
  signupError: string | null;
  onChoose: (id: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, id: string) => Promise<void>;
};

function Shift({
  event,
  shift,
  compact,
  organizationTimezone,
  authIsAuthenticated,
  ownShiftIds,
  selectedShift,
  highlightedShift,
  volunteerProfile,
  submitting,
  signupError,
  onChoose,
  onCancel,
  onSubmit,
}: Readonly<{ event: PublicPlanEvent; shift: PublicShift; compact: boolean } & ShiftProps>) {
  const full = shift.occupied_volunteers >= shift.required_volunteers;
  const status = shift.status === "CLOSED" ? "Geschlossen" : full ? "Vollständig belegt" : "Offen";
  const isOwn = ownShiftIds.has(shift.id);
  return (
    <article
      id={`shift-${shift.id}`}
      tabIndex={-1}
      aria-labelledby={`shift-${shift.id}-title`}
      className={cn(
        compact ? "p-3" : "p-4",
        highlightedShift === shift.id && "ring-2 ring-inset ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-muted-foreground">
            {event.title} · {event.event_type}
          </p>
          <h3 id={`shift-${shift.id}-title`} className="mt-1 flex items-center gap-2 font-bold">
            <Clock3 aria-hidden="true" className="h-4 w-4" />
            {formatTime(shift.starts_at, organizationTimezone)}–
            {formatTime(shift.ends_at, organizationTimezone)} Uhr
          </h3>
          {!compact ? (
            <p className="mt-1 flex gap-2 text-sm">
              <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
              {event.location}
            </p>
          ) : null}
        </div>
        <Badge id={`shift-${shift.id}-status`} variant={status === "Offen" ? "success" : "neutral"}>
          {status}
        </Badge>
      </div>
      <p
        id={`shift-${shift.id}-capacity`}
        className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Users aria-hidden="true" className="h-4 w-4" />
        {shift.occupied_volunteers} von {shift.required_volunteers} Plätzen besetzt
      </p>
      {!compact && shift.public_note ? <p className="mt-2 text-sm">{shift.public_note}</p> : null}
      {!compact && shift.volunteer_names.length > 0 ? (
        <p className="mt-2 text-sm">Eingetragen: {shift.volunteer_names.join(", ")}</p>
      ) : null}
      <Button
        type="button"
        disabled={shift.status !== "OPEN" || full || isOwn}
        onClick={() => onChoose(shift.id)}
        aria-label={`${isOwn ? "Bereits angemeldet" : shift.status !== "OPEN" ? "Geschlossen" : full ? "Vollständig belegt" : "Einsatz anmelden"}: ${event.title}, ${formatTime(shift.starts_at, organizationTimezone)} bis ${formatTime(shift.ends_at, organizationTimezone)} Uhr`}
        aria-describedby={`shift-${shift.id}-capacity shift-${shift.id}-status`}
        className="mt-3 min-h-11 w-full"
      >
        {isOwn
          ? "Bereits angemeldet"
          : shift.status !== "OPEN"
            ? "Geschlossen"
            : full
              ? "Vollständig belegt"
              : authIsAuthenticated
                ? "Einsatz anmelden"
                : "Anmelden und Einsatz wählen"}
      </Button>
      {selectedShift === shift.id ? (
        <SignupForm
          event={event}
          shift={shift}
          timezone={organizationTimezone}
          profile={volunteerProfile}
          submitting={submitting}
          error={signupError}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      ) : null}
    </article>
  );
}

function SignupForm({
  event,
  shift,
  timezone,
  profile,
  submitting,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  event: PublicPlanEvent;
  shift: PublicShift;
  timezone: string;
  profile: VolunteerProfile | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: ShiftProps["onSubmit"];
}>) {
  return (
    <form
      aria-label={`Eintragung für ${event.title}, ${formatTime(shift.starts_at, timezone)} Uhr`}
      className="mt-4 space-y-3 rounded-xl bg-muted/60 p-4"
      onSubmit={(formEvent) => void onSubmit(formEvent, shift.id)}
    >
      <h3 className="font-bold">Eintragung bestätigen</h3>
      {profile ? (
        <div className="rounded-lg border bg-background p-3 text-sm">
          <p className="font-semibold">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-muted-foreground">
            Kontaktdaten sehen nur berechtigte Verantwortliche.
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
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input className="mt-1 h-5 w-5" type="checkbox" name="public_display_consent" required />
        <span>Ich bestätige die verbindliche Anmeldung mit meinen Profildaten.</span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={submitting || !profile} className="min-h-11 flex-1">
          {submitting ? "Wird eingetragen …" : "Verbindlich eintragen"}
        </Button>
        <Button type="button" variant="secondary" disabled={submitting} onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function AccountModal({
  mode,
  registerOpened,
  organization,
  onClose,
  onSuccess,
  onRegister,
  onLogin,
}: Readonly<{
  mode: "login" | "register" | null;
  registerOpened: boolean;
  organization: ReturnType<typeof useOrganization>;
  onClose: () => void;
  onSuccess: () => void;
  onRegister: () => void;
  onLogin: () => void;
}>) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 items-center justify-center bg-black/50 p-4",
        mode ? "flex" : "hidden",
      )}
      role="dialog"
      aria-modal="true"
      aria-hidden={!mode}
      aria-label={mode === "register" ? "Helfer-Registrierung" : "Helfer-Login"}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-background p-4">
        <div className="flex justify-end">
          <button
            className="-me-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center rounded-md"
            type="button"
            aria-label="Schliessen"
            onClick={onClose}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className={mode === "register" ? undefined : "hidden"}>
          {registerOpened ? (
            <RegisterForm
              organization={organization}
              onSuccess={onSuccess}
              onSwitchToLogin={onLogin}
              variant="modal"
            />
          ) : null}
        </div>
        <div className={mode === "register" ? "hidden" : undefined}>
          <VolunteerLogin onSuccess={onSuccess} onSwitchToRegister={onRegister} />
        </div>
      </div>
    </div>
  );
}

function VolunteerLogin({
  onSuccess,
  onSwitchToRegister,
}: Readonly<{ onSuccess: () => void; onSwitchToRegister: () => void }>) {
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    if (!response.ok) {
      setError("E-Mail-Adresse oder Passwort ist ungültig.");
      return;
    }
    onSuccess();
  }
  return (
    <form className="flex flex-col gap-4 p-5" onSubmit={submit}>
      <h2 className="text-xl font-bold">Helfer-Login</h2>
      <label>
        E-Mail
        <input
          className="mt-1 min-h-11 w-full rounded border px-3"
          name="email"
          type="email"
          required
        />
      </label>
      <label>
        Passwort
        <input
          className="mt-1 min-h-11 w-full rounded border px-3"
          name="password"
          type="password"
          required
        />
      </label>
      {error ? (
        <p role="alert" className="text-status-error">
          {error}
        </p>
      ) : null}
      <button className="min-h-11 rounded bg-primary px-4 text-primary-foreground">Anmelden</button>
      <button
        type="button"
        className="min-h-11 text-center text-sm underline"
        onClick={onSwitchToRegister}
      >
        Noch kein Konto? Jetzt registrieren
      </button>
    </form>
  );
}

function SuccessMessage({
  success,
  onClose,
}: Readonly<{ success: { message: string; managementUrl: string | null }; onClose: () => void }>) {
  return (
    <div
      role="status"
      className="flex justify-between gap-3 rounded-md border border-status-success/30 bg-status-success/10 p-4 font-semibold text-status-success"
    >
      <div>
        <p>{success.message} Dein Platz ist reserviert.</p>
        {success.managementUrl ? (
          <a href={success.managementUrl} className={cn(buttonVariants(), "mt-3")}>
            Meine Eintragung öffnen
          </a>
        ) : null}
      </div>
      <Button
        variant="ghost"
        type="button"
        onClick={onClose}
        className="min-w-11 px-0"
        aria-label="Hinweis schliessen"
      >
        ×
      </Button>
    </div>
  );
}
function groupByDay(events: PublicPlanEvent[]): DayGroup[] {
  const groups = new Map<string, PublicPlanEvent[]>();
  for (const event of [...events].sort((a, b) => a.date.localeCompare(b.date)))
    groups.set(event.date, [...(groups.get(event.date) ?? []), event]);
  return [...groups].map(([date, dayEvents]) => ({ date, events: dayEvents }));
}
function findSignupShift(plan: PublicPlan, signup: VolunteerSignupSummary) {
  for (const event of plan.events) {
    if (event.title !== signup.event_title || event.date !== signup.event_date) continue;
    const shift = event.shifts.find(
      (item) => new Date(item.starts_at).getTime() === new Date(signup.shift_starts_at).getTime(),
    );
    if (shift) return { event, shift };
  }
  return null;
}
function signupStatus(entry: VolunteerSignupSummary) {
  if (entry.signup_status.includes("CANCELLED")) return "Abgesagt";
  if (entry.outcome && entry.outcome !== "PENDING") return entry.outcome;
  return "Angemeldet";
}
function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(value),
  );
}
function Summary({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <Card>
      <CardBody className="p-3">
        <strong className="block text-xl">{value}</strong>
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
