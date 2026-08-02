"use client";

import Link from "next/link";
import {
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  Settings as SettingsIcon,
  Upload,
  Users,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { LogoutButton } from "@/components/logout-button";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { OrganizationLogo } from "@/components/organization-logo";
import { Card, CardBody } from "@/components/ui/card";
import type { PublicOrganization } from "@/lib/organization";
import { FamiliesPanel } from "./families-panel";
import { AttendancePanel } from "./attendance-panel";
import { ImportPanel } from "./import-panel";
import { PlanningPanel } from "./planning-panel";
import { PlanningPlaceholderPanel } from "./planning-placeholder-panel";
import { PeriodManagementPanel } from "./period-management-panel";
import { OverviewPanel } from "./overview-panel";
import { SettingsPanel } from "./settings-panel";

export type AdminView = "overview" | "planning" | "families" | "attendance" | "settings" | "import";
export type PlanningSection = "schedule" | "kiosk" | "grill" | "periods";

const roleLabels = {
  ADMIN: "Administration",
  KOORDINATION: "Koordination",
  KIOSK: "Kiosk",
  VORSTAND_LESEN: "Vorstand (Lesen)",
} as const;

type Role = keyof typeof roleLabels;

const NAV_ITEMS: ReadonlyArray<{
  view: AdminView;
  label: string;
  icon: ReactNode;
  path: string;
  roles: readonly Role[];
}> = [
  {
    view: "overview",
    label: "Übersicht",
    icon: <LayoutDashboard aria-hidden="true" size={18} />,
    path: "",
    roles: ["ADMIN", "KOORDINATION"],
  },
  {
    view: "planning",
    label: "Planung",
    icon: <CalendarDays aria-hidden="true" size={18} />,
    path: "/planning",
    roles: ["ADMIN", "KOORDINATION"],
  },
  {
    view: "families",
    label: "Familien",
    icon: <Users aria-hidden="true" size={18} />,
    path: "/families",
    roles: ["ADMIN", "KOORDINATION"],
  },
  {
    view: "attendance",
    label: "Anwesenheit",
    icon: <ClipboardCheck aria-hidden="true" size={18} />,
    path: "/attendance",
    roles: ["ADMIN", "KOORDINATION"],
  },
  {
    view: "import",
    label: "Spielplan-Import",
    icon: <Upload aria-hidden="true" size={18} />,
    path: "/import",
    roles: ["ADMIN"],
  },
  {
    view: "settings",
    label: "Einstellungen",
    icon: <SettingsIcon aria-hidden="true" size={18} />,
    path: "/settings",
    roles: ["ADMIN"],
  },
];

export function AdminShell({
  org,
  organization,
  activeView,
  planningSection = "schedule",
}: Readonly<{
  org: string;
  organization: PublicOrganization;
  activeView: AdminView;
  planningSection?: PlanningSection;
}>) {
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
      className="min-h-dvh w-full lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]"
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
      <aside className="hidden border-r border-foreground/80 bg-foreground p-6 text-background lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-7">
        <ShellIdentity organization={organization} role={roleLabels[membership.role]} />
        {canManage ? (
          <AdminNavigation activeView={activeView} org={org} role={membership.role} vertical />
        ) : null}
        <div className="mt-auto grid gap-5 border-t border-background/15 pt-5">
          <OrganizationSwitcher memberships={auth.memberships} currentSlug={org} />
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="grid gap-4 border-b bg-background/95 px-4 py-4 shadow-sm lg:hidden md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <ShellIdentity organization={organization} role={roleLabels[membership.role]} />
            <LogoutButton />
          </div>
          {canManage ? (
            <AdminNavigation activeView={activeView} org={org} role={membership.role} />
          ) : null}
          <OrganizationSwitcher memberships={auth.memberships} currentSlug={org} />
        </header>
        <main
          id="admin-content"
          className="mx-auto min-w-0 max-w-[90rem] px-4 py-6 md:px-7 lg:px-10 lg:py-9"
        >
          {!canManage ? (
            <NoPermission text="Ihre Rolle darf diesen Administrationsbereich nicht verwalten." />
          ) : !viewAllowsRole(activeView, membership.role) ? (
            <NoPermission text="Ihre Rolle darf diesen Bereich nicht verwalten." />
          ) : activeView === "overview" ? (
            <OverviewPanel org={org} timezone={organization.timezone} />
          ) : activeView === "planning" ? (
            <div className="grid gap-6">
              <PlanningNavigation activeSection={planningSection} org={org} />
              {planningSection === "schedule" ? (
                <PlanningPanel org={org} timezone={organization.timezone} />
              ) : planningSection === "periods" ? (
                <PeriodManagementPanel org={org} />
              ) : (
                <PlanningPlaceholderPanel section={planningSection} />
              )}
            </div>
          ) : activeView === "families" ? (
            <FamiliesPanel org={org} />
          ) : activeView === "settings" ? (
            <SettingsPanel org={org} />
          ) : activeView === "import" ? (
            <ImportPanel org={org} />
          ) : (
            <AttendancePanel
              org={org}
              timezone={organization.timezone}
              currency={organization.currency}
              role={membership.role}
            />
          )}
        </main>
      </div>
    </div>
  );
}

const PLANNING_ITEMS: ReadonlyArray<{ section: PlanningSection; label: string; path: string }> = [
  { section: "schedule", label: "Spielplan", path: "/planning" },
  { section: "kiosk", label: "Kiosk", path: "/planning/kiosk" },
  { section: "grill", label: "Grill", path: "/planning/grill" },
  {
    section: "periods",
    label: "Vereinsjahr/Saisonverwaltung",
    path: "/planning/periods",
  },
];

function PlanningNavigation({
  activeSection,
  org,
}: Readonly<{ activeSection: PlanningSection; org: string }>) {
  return (
    <nav aria-label="Planung">
      <ul className="flex flex-wrap gap-2">
        {PLANNING_ITEMS.map((item) => (
          <li key={item.section}>
            <Link
              aria-current={activeSection === item.section ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                activeSection === item.section
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
              href={`/${org}/admin${item.path}`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function viewAllowsRole(view: AdminView, role: Role): boolean {
  return NAV_ITEMS.find((item) => item.view === view)?.roles.includes(role) ?? false;
}

function NoPermission({ text }: Readonly<{ text: string }>) {
  return (
    <Card>
      <CardBody>
        <h1 className="text-2xl font-bold">keine Berechtigung</h1>
        <p className="mt-2">{text}</p>
      </CardBody>
    </Card>
  );
}

function ShellIdentity({
  organization,
  role,
}: Readonly<{ organization: PublicOrganization; role: string }>) {
  return (
    <div className="flex items-center gap-3">
      <OrganizationLogo organization={organization} className="h-11 w-11 ring-2 ring-primary" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium opacity-70">{organization.name}</p>
        <p className="text-xl font-bold tracking-tight">Administration</p>
        <p className="mt-0.5 text-xs opacity-70">Rolle: {role}</p>
      </div>
    </div>
  );
}

function AdminNavigation({
  activeView,
  org,
  role,
  vertical = false,
}: Readonly<{ activeView: AdminView; org: string; role: Role; vertical?: boolean }>) {
  const base = `/${org}/admin`;
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  return (
    <nav aria-label="Administration">
      <ul className={vertical ? "grid gap-2.5" : "flex flex-wrap gap-2"}>
        {items.map((item) => (
          <li key={item.view}>
            <AdminNavLink
              active={activeView === item.view}
              href={`${base}${item.path}`}
              icon={item.icon}
              inverted={vertical}
            >
              {item.label}
            </AdminNavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AdminNavLink({
  active,
  children,
  href,
  icon,
  inverted,
}: Readonly<{
  active: boolean;
  children: ReactNode;
  href: string;
  icon: ReactNode;
  inverted: boolean;
}>) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-3 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-card"
          : inverted
            ? "border-background/20 bg-transparent text-background hover:border-background/40 hover:bg-background/10"
            : "border-border bg-background text-foreground hover:bg-muted"
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
