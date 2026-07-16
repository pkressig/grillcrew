"use client";

import { useOrganization } from "@/components/organization-provider";

export function OrganizationLanding() {
  const organization = useOrganization();
  const contactHref =
    organization.contact.url ??
    (organization.contact.email ? `mailto:${organization.contact.email}` : null);
  const theme = organization.theme;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div className="flex items-center gap-3">
        {theme.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="h-12 w-12 rounded border border-border object-contain"
            src={theme.logo_url}
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-12 w-12 rounded border"
            style={{
              backgroundColor: theme.primary_color,
              borderColor: theme.secondary_color,
            }}
          />
        )}
        <div>
          <p className="text-sm text-muted-foreground">Organisation</p>
          <h1 className="text-2xl font-bold">{organization.name}</h1>
        </div>
      </div>

      <section className="rounded-lg border p-4" style={{ borderColor: theme.secondary_color }}>
        <p className="text-base">Die Einsatzplanung wird fuer diese Organisation vorbereitet.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Sprache</dt>
            <dd>{organization.language}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Zeitzone</dt>
            <dd>{organization.timezone}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Waehrung</dt>
            <dd>{organization.currency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Slug</dt>
            <dd>{organization.slug}</dd>
          </div>
        </dl>
      </section>

      {contactHref ? (
        <a
          className="inline-flex min-h-11 items-center justify-center rounded border px-4 text-base font-medium"
          href={contactHref}
          style={{
            borderColor: theme.primary_color,
            color: theme.primary_color,
          }}
        >
          Kontakt
        </a>
      ) : null}
    </main>
  );
}
