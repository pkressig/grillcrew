import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { HelpContactForm } from "@/components/help-contact-form";
import { OrganizationLogo } from "@/components/organization-logo";
import { buttonVariants } from "@/components/ui/button";
import type { PublicOrganization } from "@/lib/organization";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Konto erstellen oder anmelden",
    description:
      "Neu hier? Erstelle kurz dein Benutzerkonto. Bereits registriert? Melde dich direkt an.",
  },
  { title: "Einsatz auswählen", description: "Im Einsatzplan siehst du die kommenden Termine." },
  {
    title: "Passende Schicht übernehmen",
    description: "Wähle die Schicht, bei der du helfen möchtest, und trage dich ein.",
  },
  {
    title: "Fertig",
    description: "Die Schicht ist für dich reserviert und im Einsatzplan sichtbar.",
  },
] as const;

export function HelpPage({
  organization,
  shiftType,
}: Readonly<{
  organization: PublicOrganization;
  shiftType: "GRILL" | "KIOSK";
}>) {
  const basePath = shiftType === "GRILL" ? "grill" : "kiosk";
  const areaLabel = shiftType === "GRILL" ? "Grill" : "Kiosk";
  const planHref = `/${encodeURIComponent(organization.slug)}/${basePath}`;
  const label = organization.settings.coordination_contact_label;
  const phone = organization.settings.coordination_contact_phone;

  return (
    <main className="min-h-dvh bg-muted/60 pb-10">
      <header className="border-b bg-background px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <OrganizationLogo organization={organization} className="h-11 w-11 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground">
              {areaLabel} Helfer Einsatzplan
            </p>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <HelpCircle aria-hidden="true" className="h-5 w-5 text-primary" />
              Hilfe
            </h1>
          </div>
          <Link
            href={planHref}
            className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
          >
            Zurück zum Einsatzplan
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <section
          aria-labelledby="anleitung-title"
          className="rounded-xl border bg-background p-5 sm:p-7"
        >
          <h2 id="anleitung-title" className="text-2xl font-bold tracking-tight">
            So trägst du dich für einen {areaLabel}-Einsatz ein
          </h2>
          <ol className="mt-5 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <div>
                  <p className="font-bold">{step.title}</p>
                  {step.description ? (
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <Link href={planHref} className={cn(buttonVariants(), "mt-6 min-h-11")}>
            Zum {areaLabel}-Einsatzplan von {organization.name}
          </Link>
          <p className="mt-6 border-t border-border/70 pt-5 text-sm font-semibold text-muted-foreground">
            Vielen Dank für deinen Einsatz für {organization.name}!
          </p>
        </section>

        <section aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-2xl font-bold tracking-tight">
            Häufige Fragen
          </h2>
          <div className="mt-5 divide-y overflow-hidden rounded-xl border bg-background">
            <FaqItem question="Muss ich mich registrieren?">
              Ja. Für die Verwaltung der Einsätze braucht jeder Helfer und jede Helferin ein eigenes
              Benutzerkonto. Die Registrierung dauert nur kurz.
            </FaqItem>
            <FaqItem question="Wo finde ich den Einsatzplan?">
              Unter{" "}
              <Link href={planHref} className="underline">
                {planHref}
              </Link>
              . Dort findest du alle aktuell ausgeschriebenen {areaLabel}-Einsätze und Schichten.
            </FaqItem>
            <FaqItem question="Wie melde ich mich für einen Einsatz an?">
              Einfach anmelden, den gewünschten Einsatz auswählen und dich für eine noch freie
              Schicht eintragen.
            </FaqItem>
            <FaqItem question="Kann ich sehen, welche Schichten noch frei sind?">
              Ja. Im Einsatzplan ist bei jedem Tag und jeder Schicht ersichtlich, wie viele Plätze
              noch frei sind.
            </FaqItem>
            <FaqItem question="Kann ich mich wieder aus einer Schicht austragen?">
              Innerhalb der Abmeldefrist kannst du deine Eintragung direkt im Einsatzplan oder in
              deinem Profil wieder absagen. Ist die Frist bereits abgelaufen oder steht der Einsatz
              kurz bevor, melde dich bitte direkt bei {label ?? "der Koordination"}, damit
              rechtzeitig Ersatz organisiert werden kann.
            </FaqItem>
            <FaqItem question="Ich habe mein Passwort vergessen. Was mache ich?">
              Nutze beim Anmelden die Funktion „Passwort vergessen?“. Falls etwas nicht
              funktioniert, melde dich einfach bei {label ?? "der Koordination"}.
            </FaqItem>
            <FaqItem question="Die Webseite funktioniert bei mir nicht richtig.">
              Die Plattform wird laufend weiterentwickelt. Falls du einen Fehler findest oder etwas
              nicht funktioniert, melde dich bitte bei {label ?? "der Koordination"} — am besten mit
              einer kurzen Beschreibung und, wenn möglich, einem Screenshot.
            </FaqItem>
            <FaqItem question="Muss ich noch irgendwo anders Bescheid geben, wenn ich eine Schicht übernehme?">
              Nein. Sobald du dich über die Plattform für einen Einsatz eingetragen hast, ist deine
              Anmeldung dort erfasst.
            </FaqItem>
            <FaqItem question="Kann ich die Plattform auch auf dem Handy benutzen?">
              Ja. Die Seite kann direkt über den Browser auf dem Smartphone geöffnet und benutzt
              werden — ganz ohne App-Installation.
            </FaqItem>
            <FaqItem question="Warum gibt es jetzt eine eigene Plattform?">
              Damit jederzeit klar ersichtlich ist, welche Einsätze anstehen, welche Schichten noch
              frei sind, wer bereits eingetragen ist und wo noch Helfer gesucht werden — statt
              kurzfristig in einer Chatgruppe nach Helfenden zu suchen.
            </FaqItem>
            <FaqItem question="Ich habe eine Frage, einen Verbesserungsvorschlag oder eine Idee.">
              Sehr gerne! Die Plattform wird momentan noch weiterentwickelt. Feedback, Fehler oder
              Verbesserungsvorschläge kannst du jederzeit direkt an {label ?? "die Koordination"}{" "}
              schicken.
            </FaqItem>
          </div>
        </section>

        {phone ? (
          <section
            aria-labelledby="kontakt-title"
            className="rounded-xl border bg-background p-5 sm:p-7"
          >
            <h2 id="kontakt-title" className="text-xl font-bold tracking-tight">
              Direkt Kontakt
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Schreib {label ?? "der Koordination"} direkt eine Nachricht — sie wird für WhatsApp
              vorbereitet und kann von dort gesendet werden.
            </p>
            <HelpContactForm phone={phone} label={label} />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function FaqItem({
  question,
  children,
}: Readonly<{ question: string; children: React.ReactNode }>) {
  return (
    <details className="group p-4 sm:p-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold marker:content-none">
        {question}
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </details>
  );
}
