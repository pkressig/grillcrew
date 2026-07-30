"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useOrganization } from "@/components/organization-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
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
        <Card>
          <CardBody className="space-y-5 p-5 sm:p-7">
            <PageHeader
              title="Link nicht gültig"
              description="Diese Eintragung konnte nicht gefunden werden."
            />
            <p className="text-sm text-muted-foreground">
              Bitte überprüfe den persönlichen Web-Link oder kontaktiere die Koordination deiner
              Organisation.
            </p>
          </CardBody>
        </Card>
      </Shell>
    );
  if (!signup)
    return (
      <Shell>
        <Card role="status" aria-live="polite">
          <CardBody className="p-6 text-center text-muted-foreground">
            Eintragung wird geladen …
          </CardBody>
        </Card>
      </Shell>
    );

  const cancelled = signup.signup_status !== "ACTIVE";
  return (
    <Shell>
      <Card>
        <CardBody className="p-4 sm:p-7">
          <PageHeader
            title="Meine Eintragung"
            description={signup.organization_name}
            action={
              <Badge variant={cancelled ? "neutral" : "success"}>
                {cancelled ? "Abgesagt" : "Bestätigt"}
              </Badge>
            }
          />

          <p
            role="status"
            className={`mt-5 rounded-md border p-4 font-semibold ${
              cancelled
                ? "border-status-neutral/30 bg-status-neutral/10 text-foreground"
                : "border-status-success/30 bg-status-success/10 text-status-success"
            }`}
          >
            {cancelled ? "Diese Eintragung ist abgesagt." : "Du bist verbindlich eingetragen."}
          </p>

          <section
            aria-labelledby="event-details-heading"
            className="mt-5 rounded-md border border-border/70 p-4 sm:p-5"
          >
            <h2 id="event-details-heading" className="text-lg font-semibold">
              Einsatzdetails
            </h2>
            <p className="mt-3 text-xl font-semibold text-foreground">{signup.event_title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{signup.event_type}</p>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Datum" value={formatDate(signup.event_date)} />
              <Detail
                label="Zeit"
                value={`${formatTime(signup.shift_starts_at, organization.timezone)}–${formatTime(signup.shift_ends_at, organization.timezone)} Uhr`}
              />
              <Detail label="Ort" value={signup.event_location} />
              <Detail
                label="Absagefrist"
                value={formatDateTime(signup.cancellation_deadline, organization.timezone) + " Uhr"}
              />
            </dl>
            {signup.event_public_description ? (
              <p className="mt-4 border-t border-border/70 pt-4 text-sm text-muted-foreground">
                {signup.event_public_description}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="personal-details-heading" className="mt-5">
            <h2 id="personal-details-heading" className="text-lg font-semibold">
              Persönliche Angaben
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Öffentlicher Name" value={signup.public_name} />
              <Detail label="Telefon" value={signup.phone} />
              <Detail label="E-Mail" value={signup.email} />
            </dl>
          </section>

          <aside
            aria-labelledby="privacy-heading"
            className="mt-5 rounded-md border border-border/70 bg-muted/50 p-4 text-sm text-muted-foreground"
          >
            <h2 id="privacy-heading" className="font-semibold text-foreground">
              Deine Daten bleiben geschützt
            </h2>
            <p className="mt-1">
              Deine Kontaktdaten sind nur über diesen persönlichen Link einsehbar und nicht
              öffentlich im Einsatzplan sichtbar.
            </p>
          </aside>

          <section aria-labelledby="cancellation-heading" className="mt-6">
            <h2 id="cancellation-heading" className="text-lg font-semibold">
              Absage
            </h2>
            {cancelled ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Für diese Eintragung ist keine weitere Aktion nötig.
              </p>
            ) : null}
            {!cancelled && signup.can_cancel ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Falls du verhindert bist, kannst du deine Eintragung hier endgültig absagen.
                </p>
                <Button
                  variant="destructive"
                  aria-label="Eintragung endgültig absagen"
                  disabled={cancelling}
                  onClick={() => void cancelSignup()}
                  className="mt-4 w-full sm:w-auto"
                >
                  {cancelling ? "Wird abgesagt …" : "Eintragung absagen"}
                </Button>
              </>
            ) : null}
            {!cancelled && !signup.can_cancel ? (
              <div className="mt-3 rounded-md border border-status-warning/30 bg-status-warning/10 p-4 text-foreground">
                <p className="font-semibold text-status-warning">
                  Direkte Absage nicht mehr möglich
                </p>
                <p className="mt-1 text-sm">{signup.cancellation_guidance}</p>
              </div>
            ) : null}
          </section>
          {cancelError ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
            >
              Die Absage ist nicht gelungen. Bitte lade die Seite neu oder kontaktiere die
              Koordination.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </Shell>
  );
}

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-dvh bg-muted/60 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </main>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
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
