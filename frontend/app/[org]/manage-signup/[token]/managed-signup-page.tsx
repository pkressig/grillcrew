"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@/components/organization-provider";
import { cancelManagedSignup, fetchManagedSignup, type ManagedSignup } from "@/lib/public-plan";

export function ManagedSignupPage({ token }: Readonly<{ token: string }>) {
  const organization = useOrganization();
  const [signup, setSignup] = useState<ManagedSignup | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchManagedSignup(organization.slug, token)
      .then((result) => active && setSignup(result))
      .catch(() => active && setInvalid(true));
    return () => {
      active = false;
    };
  }, [organization.slug, token]);

  async function cancelSignup() {
    if (
      !window.confirm(
        "Möchtest du deine Eintragung wirklich absagen? Diese Aktion kann nicht rückgängig gemacht werden.",
      )
    )
      return;
    setCancelling(true);
    setCancelError(false);
    try {
      setSignup(await cancelManagedSignup(organization.slug, token));
    } catch {
      setCancelError(true);
    } finally {
      setCancelling(false);
    }
  }

  if (invalid)
    return (
      <Shell>
        <Message title="Link nicht gültig">
          Diese Eintragung konnte nicht gefunden werden. Bitte überprüfe den Web-Link oder
          kontaktiere die Koordination deiner Organisation.
        </Message>
      </Shell>
    );
  if (!signup)
    return (
      <Shell>
        <div
          role="status"
          className="rounded-2xl border bg-background p-6 text-center text-muted-foreground"
        >
          Eintragung wird geladen …
        </div>
      </Shell>
    );

  const cancelled = signup.signup_status !== "ACTIVE";
  return (
    <Shell>
      <article className="rounded-2xl border bg-background p-5 shadow-sm">
        <p className="text-sm font-semibold text-muted-foreground">{signup.organization_name}</p>
        <h1 className="mt-1 text-2xl font-bold">Meine Eintragung</h1>
        <p
          className={`mt-4 rounded-lg p-3.5 font-semibold ${cancelled ? "bg-neutral-100 text-neutral-800" : "bg-green-100 text-green-950 border border-green-200"}`}
        >
          {cancelled ? "Diese Eintragung ist abgesagt." : "Du bist verbindlich eingetragen."}
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <Detail label="Anlass" value={`${signup.event_title} · ${signup.event_type}`} />
          <Detail label="Datum" value={formatDate(signup.event_date)} />
          <Detail label="Ort" value={signup.event_location} />
          <Detail
            label="Einsatz"
            value={`${formatTime(signup.shift_starts_at, organization.timezone)}–${formatTime(signup.shift_ends_at, organization.timezone)} Uhr`}
          />
          <Detail label="Öffentlicher Name" value={signup.public_name} />
          <Detail label="Telefon" value={signup.phone} />
          <Detail label="E-Mail" value={signup.email} />
          <Detail
            label="Absagefrist"
            value={formatDateTime(signup.cancellation_deadline, organization.timezone) + " Uhr"}
          />
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Deine Kontaktdaten sind nur über diesen persönlichen Link einsehbar und nicht öffentlich
          im Einsatzplan sichtbar.
        </p>
        {signup.event_public_description ? (
          <p className="mt-4 text-sm text-muted-foreground">{signup.event_public_description}</p>
        ) : null}
        {!cancelled && signup.can_cancel ? (
          <button
            type="button"
            aria-label="Eintragung endgültig absagen"
            disabled={cancelling}
            onClick={() => void cancelSignup()}
            className="mt-6 min-h-11 w-full rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 disabled:opacity-60"
          >
            {cancelling ? "Wird abgesagt …" : "Eintragung absagen"}
          </button>
        ) : null}
        {!cancelled && !signup.can_cancel ? (
          <div className="mt-6 rounded-lg bg-amber-50 p-4 text-amber-950">
            <p className="font-semibold">Direkte Absage nicht mehr möglich</p>
            <p className="mt-1 text-sm">{signup.cancellation_guidance}</p>
          </div>
        ) : null}
        {cancelError ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Die Absage ist nicht gelungen. Bitte lade die Seite neu oder kontaktiere die
            Koordination.
          </p>
        ) : null}
      </article>
    </Shell>
  );
}

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-dvh bg-muted/60 px-4 py-6">
      <div className="mx-auto max-w-2xl">{children}</div>
    </main>
  );
}
function Message({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-2xl border bg-background p-7 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </section>
  );
}
function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(value),
  );
}
