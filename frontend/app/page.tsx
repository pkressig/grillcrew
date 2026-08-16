import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Flame, HandCoins, Palette, Smartphone, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "GrillCrew – Helfer-Einsatzplanung für Vereine",
  description:
    "GrillCrew hilft Sportvereinen, Helfereinsätze am Grillstand, Kiosk und an Spieltagen einfach, fair und mobil zu planen.",
};

// The platform does not yet have a public domain or a dedicated contact
// address. Replace this placeholder with the real address once that is
// decided (see docs/DECISIONS.md) — do not treat it as a working inbox.
const CONTACT_EMAIL = "hallo@DEINE-DOMAIN";
const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

type Feature = { icon: LucideIcon; title: string; description: string };

const FEATURES: Feature[] = [
  {
    icon: Palette,
    title: "Eigener Bereich pro Verein",
    description:
      "Jeder Verein erhält seinen eigenen, mandantenfähigen Bereich mit eigenem Logo und eigenen Farben – unabhängig von allen anderen Vereinen auf der Plattform.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first für alle Altersgruppen",
    description:
      "Grosse Bedienelemente und klare Sprache: GrillCrew funktioniert auf dem Smartphone und ist für junge wie ältere Helferinnen und Helfer verständlich.",
  },
  {
    icon: HandCoins,
    title: "Faire, nachvollziehbare Vergütung",
    description:
      "Pro Einsatz frei wählbar: Auszahlung oder Spende an den Verein. Immer transparent und für jeden Einsatz einzeln nachvollziehbar.",
  },
  {
    icon: Users,
    title: "Familien- und Kinderzuordnung",
    description:
      "Einsätze lassen sich einem Kind oder Familienmitglied zuordnen, damit gemeinsame Helfereinsätze der richtigen Person gutgeschrieben werden.",
  },
];

const STEPS: { title: string; description: string }[] = [
  {
    title: "Verein richtet seinen Bereich ein",
    description: "Der Verein erhält einen eigenen Bereich mit Vereinslogo und Vereinsfarben.",
  },
  {
    title: "Helfer registrieren sich",
    description:
      "Helferinnen und Helfer legen ein Konto an und melden sich für passende Einsätze an.",
  },
  {
    title: "Schichten werden online verwaltet",
    description:
      "Einsätze, Anmeldungen und Vergütungen laufen digital und übersichtlich an einem Ort zusammen.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border/70 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Flame aria-hidden="true" className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">GrillCrew</span>
        </div>
      </header>

      <section className="border-b border-border/70 bg-muted/60 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 text-left">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Helfer-Einsatzplanung für Vereine — einfach, fair, mobil
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            GrillCrew hilft Sportvereinen, Helfereinsätze am Grillstand, Kiosk und an Spieltagen zu
            planen — verständlich für Helferinnen und Helfer jeden Alters und jederzeit vom
            Smartphone aus nutzbar.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={CONTACT_MAILTO} className={cn(buttonVariants(), "min-h-11")}>
              Kontakt aufnehmen
            </a>
            <a
              href="#so-einfach-gehts"
              className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
            >
              So funktioniert&apos;s
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="kernvorteile-title" className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 id="kernvorteile-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Kernvorteile
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader className="flex flex-row items-center gap-3">
                  <feature.icon aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
                  <h3 className="font-bold">{feature.title}</h3>
                </CardHeader>
                <CardBody className="pt-3 text-sm text-muted-foreground">
                  {feature.description}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section
        id="so-einfach-gehts"
        aria-labelledby="so-einfach-gehts-title"
        className="border-y border-border/70 bg-muted/60 px-4 py-14 sm:px-6"
      >
        <div className="mx-auto max-w-5xl">
          <h2 id="so-einfach-gehts-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            So einfach geht&apos;s
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-md border bg-background p-5 shadow-card">
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <h3 className="mt-3 font-bold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="kontakt-title" className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="kontakt-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Interesse für deinen Verein?
          </h2>
          <p className="mt-3 text-muted-foreground">
            GrillCrew wird laufend für weitere Sportvereine bereitgestellt. Melde dich
            unverbindlich, wenn du GrillCrew für deinen Verein einrichten möchtest.
          </p>
          <a href={CONTACT_MAILTO} className={cn(buttonVariants(), "mt-6 min-h-11 min-w-56")}>
            Jetzt Kontakt aufnehmen
          </a>
        </div>
      </section>

      <footer className="border-t border-border/70 px-4 py-6 text-center text-sm text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} GrillCrew
      </footer>
    </main>
  );
}
