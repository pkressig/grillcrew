"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { LogoutButton } from "@/components/logout-button";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import type { PublicOrganization } from "@/lib/organization";

const roleLabels = {
  ADMIN: "Administration",
  KOORDINATION: "Koordination",
  KIOSK: "Kiosk",
  VORSTAND_LESEN: "Vorstand (Lesen)",
} as const;

export function AdminShell({
  org,
  organization,
}: Readonly<{ org: string; organization: PublicOrganization }>) {
  const auth = useAuth();
  if (auth.isLoading)
    return <State title="Sitzung wird geladen" text="Bitte warten Sie einen Moment." />;
  if (!auth.isAuthenticated)
    return (
      <State
        title="Anmeldung erforderlich"
        text="Melden Sie sich an, um den Administrationsbereich zu öffnen."
        login
      />
    );
  const membership = auth.memberships.find((item) => item.organization_slug === org);
  if (!membership)
    return (
      <State title="Kein Zugriff" text="Ihr Konto hat keinen Zugriff auf diese Organisation." />
    );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-sm text-muted-foreground">{organization.name}</p>
          <h1 className="text-2xl font-bold">Administration</h1>
          <p className="mt-1 text-sm">Rolle: {roleLabels[membership.role]}</p>
        </div>
        <LogoutButton />
      </header>
      <OrganizationSwitcher memberships={auth.memberships} currentSlug={org} />
      <section className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Bereiche</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          <li className="rounded border p-4">Einsatzplanung (folgt)</li>
          {membership.role === "ADMIN" || membership.role === "KOORDINATION" ? (
            <li className="rounded border p-4">Helfer und Familien (folgt)</li>
          ) : null}
          {membership.role === "ADMIN" ? (
            <li className="rounded border p-4">Organisation und Rollen (folgt)</li>
          ) : null}
          {membership.role === "VORSTAND_LESEN" ? (
            <li className="rounded border p-4">Auswertungen (folgt)</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}

function State({
  title,
  text,
  login = false,
}: Readonly<{ title: string; text: string; login?: boolean }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p>{text}</p>
      {login ? (
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded border px-4 font-medium"
          href="/login"
        >
          Zur Anmeldung
        </Link>
      ) : null}
    </main>
  );
}
