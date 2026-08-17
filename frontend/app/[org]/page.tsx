import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, HandCoins, MessageCircle, Phone, Sparkles, Users } from "lucide-react";
import { OrganizationLogo } from "@/components/organization-logo";
import { OrganizationProvider } from "@/components/organization-provider";
import { Card, CardBody } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { fetchPublicOrganizationStrict, type PublicOrganization } from "@/lib/organization";
import { telHref, whatsAppHref } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { VolunteerInterestForm } from "./volunteer-interest-form";

export const dynamic = "force-dynamic";

type OrganizationPageProps = {
  params: Promise<{
    org: string;
  }>;
};

export async function generateMetadata({
  params,
}: Readonly<OrganizationPageProps>): Promise<Metadata> {
  const { org } = await params;
  const organization = await fetchPublicOrganizationStrict(org);
  if (!organization) redirect("/vereine");
  return { title: `${organization.name} – Werde Helfer` };
}

const REASONS = [
  {
    icon: CalendarCheck,
    title: "Flexible Schichtwahl",
    description:
      "Du entscheidest, wie oft du mitmachst — von einer einzelnen Schicht bis zu regelmässigen Einsätzen.",
  },
  {
    icon: HandCoins,
    title: "Vergütung wählbar",
    description:
      "Pro Einsatz frei wählbar: Auszahlung für dich oder eine Spende an den Verein. Immer transparent.",
  },
  {
    icon: Users,
    title: "Gemeinschaft",
    description:
      "Ihr könnt euch als Familie einteilen — Einsätze lassen sich auch einem Kind oder Familienmitglied gutschreiben.",
  },
] as const;

const STEPS = [
  { title: "Konto erstellen", description: "In wenigen Minuten registrierst du dich kostenlos." },
  {
    title: "Schicht wählen",
    description: "Du siehst alle offenen Einsätze bei Grill und Kiosk und meldest dich direkt an.",
  },
  { title: "Dabei sein", description: "Am Spieltag bist du Teil des Teams — herzlich willkommen." },
] as const;

export default async function OrganizationHubPage({ params }: Readonly<OrganizationPageProps>) {
  const { org } = await params;
  const organization = await fetchPublicOrganizationStrict(org);
  if (!organization) redirect("/vereine");
  const grillHref = `/${encodeURIComponent(org)}/grill`;
  const kioskHref = `/${encodeURIComponent(org)}/kiosk`;

  return (
    <OrganizationProvider organization={organization}>
      <main
        className="min-h-dvh bg-background"
        style={
          {
            "--primary": organization.theme.primary_color,
            "--secondary": organization.theme.secondary_color,
          } as CSSProperties
        }
      >
        <section
          className="border-b border-border/70 px-4 py-14 sm:px-6 sm:py-20"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, var(--primary) 16%, transparent), color-mix(in srgb, var(--secondary) 22%, transparent))`,
          }}
        >
          <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 text-left">
            <OrganizationLogo organization={organization} className="h-16 w-16 rounded-lg" />
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Werde Helfer bei {organization.name}
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Ohne Helferinnen und Helfer läuft an unseren Spieltagen nichts — melde dich für eine
              oder mehrere Schichten an und werde Teil des Teams.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={grillHref} className={cn(buttonVariants(), "min-h-11")}>
                Grill-Einsätze ansehen
              </Link>
              <Link
                href={kioskHref}
                className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
              >
                Kiosk-Einsätze ansehen
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="warum-mithelfen-title" className="px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="h-6 w-6 text-primary" />
              <h2
                id="warum-mithelfen-title"
                className="text-2xl font-bold tracking-tight sm:text-3xl"
              >
                Warum mithelfen?
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {REASONS.map((reason) => (
                <Card key={reason.title}>
                  <CardBody>
                    <reason.icon aria-hidden="true" className="h-7 w-7 text-primary" />
                    <h3 className="mt-3 font-bold">{reason.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{reason.description}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="so-funktionierts-title"
          className="border-y border-border/70 bg-muted/60 px-4 py-14 sm:px-6"
        >
          <div className="mx-auto max-w-5xl">
            <h2
              id="so-funktionierts-title"
              className="text-2xl font-bold tracking-tight sm:text-3xl"
            >
              So funktioniert&apos;s
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
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={grillHref} className={cn(buttonVariants(), "min-h-11")}>
                Grill-Einsätze ansehen
              </Link>
              <Link
                href={kioskHref}
                className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
              >
                Kiosk-Einsätze ansehen
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="bewerbung-title" className="px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <h2 id="bewerbung-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Noch nicht sicher? Bewirb dich
            </h2>
            <p className="mt-3 text-muted-foreground">
              Weisst du noch nicht genau, wann du Zeit hast, oder möchtest du zuerst Fragen klären?
              Hinterlasse uns kurz deine Angaben — wir melden uns bei dir.
            </p>
            <div className="mt-6">
              <VolunteerInterestForm organization={organization} />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="kontakt-title"
          className="border-t border-border/70 px-4 py-14 sm:px-6"
        >
          <div className="mx-auto max-w-2xl">
            <h2 id="kontakt-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Direkt Kontakt
            </h2>
            <ContactSection organization={organization} />
          </div>
        </section>
      </main>
    </OrganizationProvider>
  );
}

function ContactSection({ organization }: Readonly<{ organization: PublicOrganization }>) {
  const label = organization.settings.coordination_contact_label;
  const phone = organization.settings.coordination_contact_phone;
  const message = `Hallo${label ? " " + label : ""}, ich interessiere mich als Helfer/in bei ${organization.name} und habe eine Frage.`;

  if (!phone) {
    return (
      <p className="mt-3 text-muted-foreground">
        Hast du Fragen? Registriere dich und wähle eine Schicht — die Koordination deines Vereins
        meldet sich bei Bedarf direkt bei dir.
      </p>
    );
  }

  return (
    <>
      <p className="mt-3 text-muted-foreground">
        Hast du Fragen? Kontaktiere {label ?? "die Koordination"} direkt per WhatsApp oder Telefon.
      </p>
      <p className="mt-2 font-semibold">
        {label ? `${label} · ` : ""}
        {phone}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a
          className={buttonVariants({ variant: "primary" })}
          href={whatsAppHref(phone, message)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          WhatsApp senden
        </a>
        <a className={buttonVariants({ variant: "secondary" })} href={telHref(phone)}>
          <Phone aria-hidden="true" className="h-4 w-4" />
          Anrufen
        </a>
      </div>
    </>
  );
}
