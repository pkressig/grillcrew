import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import type { ManagedSignup } from "@/lib/public-plan";

/** Read-only "Meine Eintragung" detail: shared by the emailed, token-based
 * manage-signup page and the authenticated own-signup page reachable from
 * the app. Each caller supplies its own cancellation UI via `cancelSection`,
 * since the two flows cancel through different endpoints. */
export function SignupDetailCard({
  signup,
  timezone,
  cancelSection,
}: Readonly<{
  signup: ManagedSignup;
  timezone: string;
  cancelSection: ReactNode;
}>) {
  const cancelled = signup.signup_status !== "ACTIVE";
  return (
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
              value={`${formatTime(signup.shift_starts_at, timezone)}–${formatTime(signup.shift_ends_at, timezone)} Uhr`}
            />
            <Detail label="Ort" value={signup.event_location} />
            <Detail
              label="Absagefrist"
              value={formatDateTime(signup.cancellation_deadline, timezone) + " Uhr"}
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
            Deine Kontaktdaten sind nur über diesen persönlichen Link einsehbar und nicht öffentlich
            im Einsatzplan sichtbar.
          </p>
        </aside>

        {cancelSection}
      </CardBody>
    </Card>
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
