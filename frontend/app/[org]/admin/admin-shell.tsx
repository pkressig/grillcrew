"use client";

import Link from "next/link";
import { CalendarDays, ClipboardCheck, Users } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { LogoutButton } from "@/components/logout-button";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { OrganizationLogo } from "@/components/organization-logo";
import { Card, CardBody } from "@/components/ui/card";
import type { PublicOrganization } from "@/lib/organization";
import { FamiliesPanel } from "./families-panel";
import { PlanningPanel } from "./planning-panel";

export type AdminView = "planning" | "families";

const roleLabels = {
  ADMIN: "Administration",
  KOORDINATION: "Koordination",
  KIOSK: "Kiosk",
  VORSTAND_LESEN: "Vorstand (Lesen)",
} as const;

export function AdminShell({
  org,
  organization,
  activeView,
}: Readonly<{ org: string; organization: PublicOrganization; activeView: AdminView }>) {
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
  const canManage = membership.role === "ADMIN" || membership.role === "KOORDINATION";

  return (
    <div
      className="mx-auto min-h-dvh w-full max-w-[1440px] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]"
      style={
        {
          "--primary": organization.theme.primary_color,
          "--secondary": organization.theme.secondary_color,
        } as CSSProperties
      }
    >
      <a
        className="sr-only z-50 rounded bg-background p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        href="#admin-content"
      >
        Zum Inhalt
      </a>
      <aside className="hidden border-r p-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6">
        <ShellIdentity organization={organization} role={roleLabels[membership.role]} />
        {canManage ? <AdminNavigation activeView={activeView} org={org} vertical /> : null}
        <div className="mt-auto grid gap-4">
          <OrganizationSwitcher memberships={auth.memberships} currentSlug={org} />
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="grid gap-4 border-b px-4 py-4 lg:hidden md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <ShellIdentity organization={organization} role={roleLabels[membership.role]} />
            <LogoutButton />
          </div>
          {canManage ? <AdminNavigation activeView={activeView} org={org} /> : null}
          <OrganizationSwitcher memberships={auth.memberships} currentSlug={org} />
        </header>
        <main id="admin-content" className="min-w-0 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {canManage ? (
            activeView === "planning" ? (
              <PlanningPanel org={org} timezone={organization.timezone} />
            ) : (
              <FamiliesPanel org={org} />
            )
          ) : (
            <Card>
              <CardBody>
                <h1 className="text-2xl font-bold">keine Berechtigung</h1>
                <p className="mt-2">
                  Ihre Rolle darf diesen Administrationsbereich nicht verwalten.
                </p>
              </CardBody>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

function ShellIdentity({
  organization,
  role,
}: Readonly<{ organization: PublicOrganization; role: string }>) {
  return (
    <div className="flex items-center gap-3">
      <OrganizationLogo organization={organization} />
      <div>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
        <p className="text-xl font-bold">Administration</p>
        <p className="mt-1 text-sm">Rolle: {role}</p>
      </div>
    </div>
  );
}

function AdminNavigation({
  activeView,
  org,
  vertical = false,
}: Readonly<{ activeView: AdminView; org: string; vertical?: boolean }>) {
  const base = `/${org}/admin`;
  return (
    <nav aria-label="Administration">
      <ul className={vertical ? "grid gap-2" : "flex flex-wrap gap-2"}>
        <li>
          <AdminNavLink
            active={activeView === "planning"}
            href={`${base}/planning`}
            icon={<CalendarDays aria-hidden="true" size={18} />}
          >
            Planung
          </AdminNavLink>
        </li>
        <li>
          <AdminNavLink
            active={activeView === "families"}
            href={`${base}/families`}
            icon={<Users aria-hidden="true" size={18} />}
          >
            Familien
          </AdminNavLink>
        </li>
        <li>
          <AdminNavLink
            active={false}
            href={`${base}/planning#attendance`}
            icon={<ClipboardCheck aria-hidden="true" size={18} />}
          >
            Anwesenheit
          </AdminNavLink>
        </li>
      </ul>
    </nav>
  );
}

function AdminNavLink({
  active,
  children,
  href,
  icon,
}: Readonly<{ active: boolean; children: ReactNode; href: string; icon: ReactNode }>) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 py-2 text-sm font-medium ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted"
      }`}
      href={href}
    >
      {icon}
      {children}
    </Link>
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
