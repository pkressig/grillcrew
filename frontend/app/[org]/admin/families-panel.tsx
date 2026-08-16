"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  createFamily,
  createFamilyMember,
  createVolunteer,
  deleteVolunteer,
  loadAllVolunteers,
  loadFamilies,
  loadFamilyChildren,
  loadFamilyMembers,
  loadFamilyVolunteers,
  loadVolunteerFamily,
  sendVolunteerPasswordReset,
  setVolunteerPassword,
  updateFamilyMemberVolunteer,
  updateFamilyVolunteer,
  type Family,
  type FamilyChild,
  type FamilyListItem,
  type FamilyMember,
  type FamilyMemberType,
  type FamilyVolunteer,
  type FamilyVolunteerUpdate,
  type VolunteerCompensation,
  type VolunteerDirectoryEntry,
  type VolunteerFamily,
  type VolunteerStatus,
} from "@/lib/families";
import { cn } from "@/lib/utils";

const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
const memberTypeLabels: Record<FamilyMemberType, string> = { CHILD: "Kind", HELPER: "Helfer" };
const compensationLabels: Record<VolunteerCompensation, string> = {
  WORK_HOURS: "Sollstunden",
  VOLUNTARY: "Unentgeltlich",
  PAYOUT: "Bezahlt",
};
const statusLabels: Record<VolunteerStatus, string> = { ACTIVE: "Aktiv", INACTIVE: "Inaktiv" };

type Tab = "helfer" | "familien" | "kinder";

function queryParam(name: string) {
  return typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get(name);
}

function initialTab(): Tab {
  const explicit = queryParam("tab");
  if (explicit === "familien" || explicit === "helfer" || explicit === "kinder") return explicit;
  // A deep link that only carries ?family=… means "show me that family", so infer the tab.
  return queryParam("family") ? "familien" : "helfer";
}

export function FamiliesPanel({ org }: Readonly<{ org: string }>) {
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const sync = () => setTab(initialTab());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function selectTab(next: Tab) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setTab(next);
  }

  function jumpToFamily(familyId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "familien");
    url.searchParams.set("family", familyId);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setTab("familien");
  }

  function jumpToVolunteer(volunteerId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "helfer");
    url.searchParams.set("volunteer", volunteerId);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setTab("helfer");
  }

  return (
    <section className="grid gap-7" aria-labelledby="families-heading">
      <div className="flex gap-2 border-b" role="tablist" aria-label="Ansicht">
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "helfer"}
          variant={tab === "helfer" ? "primary" : "ghost"}
          onClick={() => selectTab("helfer")}
        >
          Helfer
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "familien"}
          variant={tab === "familien" ? "primary" : "ghost"}
          onClick={() => selectTab("familien")}
        >
          Familien
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "kinder"}
          variant={tab === "kinder" ? "primary" : "ghost"}
          onClick={() => selectTab("kinder")}
        >
          Kinder
        </Button>
      </div>
      {tab === "helfer" ? (
        <VolunteersView org={org} onShowFamily={jumpToFamily} />
      ) : tab === "familien" ? (
        <FamiliesView org={org} />
      ) : (
        <ChildrenView org={org} onShowFamily={jumpToFamily} onShowVolunteer={jumpToVolunteer} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helfer (primary): volunteer list, detail, direct creation, family drill-down,
// password actions.
// ---------------------------------------------------------------------------

function VolunteersView({
  org,
  onShowFamily,
}: Readonly<{ org: string; onShowFamily: (familyId: string) => void }>) {
  const [volunteers, setVolunteers] = useState<VolunteerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => queryParam("volunteer"));
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setVolunteers(await loadAllVolunteers(org));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Helfer konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const sync = () => {
      setSelectedId(queryParam("volunteer"));
      setCreating(false);
      setSuccess(null);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const selected = volunteers.find((volunteer) => volunteer.id === selectedId) ?? null;
  const filtered = useMemo(
    () =>
      volunteers.filter((volunteer) =>
        `${volunteer.first_name} ${volunteer.last_name}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      ),
    [volunteers, search],
  );

  function select(id: string | null, preserveSuccess = false) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("volunteer", id);
    else url.searchParams.delete("volunteer");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSelectedId(id);
    setCreating(false);
    if (!preserveSuccess) setSuccess(null);
  }

  return (
    <>
      <PageHeader
        headingId="families-heading"
        title="Helfer"
        description="Alle Helfer der Organisation durchsuchen, bearbeiten und verwalten."
        action={
          <Button
            onClick={() => {
              setCreating(true);
              setSelectedId(null);
              setSuccess(null);
            }}
          >
            Neuer Helfer
          </Button>
        }
      />
      {error ? (
        <p
          className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-md border border-status-success/30 bg-status-success/5 p-3 text-sm text-status-success"
          role="status"
        >
          {success}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(22rem,34rem)_minmax(0,1fr)]">
        <section
          className={`${selected || creating ? "hidden lg:block" : "block"} min-w-0`}
          aria-label="Helferliste"
        >
          <Card className="h-full border-border/80">
            <CardBody>
              <label className="grid gap-1" htmlFor="volunteer-search">
                Helfer suchen
                <input
                  className={control}
                  id="volunteer-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {search ? (
                <Button
                  className="mt-2 px-0 underline"
                  variant="ghost"
                  onClick={() => setSearch("")}
                >
                  Suche löschen
                </Button>
              ) : null}
              {loading ? (
                <p className="mt-4" role="status">
                  Helfer werden geladen …
                </p>
              ) : volunteers.length === 0 ? (
                <p className="mt-4">Noch keine Helfer vorhanden.</p>
              ) : filtered.length === 0 ? (
                <p className="mt-4">Keine Helfer für diese Suche gefunden.</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-md border">
                  <table
                    className="w-full table-fixed border-collapse text-left"
                    aria-label="Helfer"
                  >
                    <colgroup>
                      <col className="w-[55%]" />
                      <col className="w-[25%]" />
                      <col className="w-[20%]" />
                    </colgroup>
                    <thead className="bg-muted/60 text-sm text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Helfer
                        </th>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Familie
                        </th>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((volunteer) => {
                        const active = selected?.id === volunteer.id;
                        return (
                          <tr
                            className={cn(
                              "border-t transition-colors",
                              active ? "bg-primary/5" : "hover:bg-muted/40",
                            )}
                            key={volunteer.id}
                          >
                            <th className="p-0 font-medium" scope="row">
                              <button
                                aria-current={active ? "true" : undefined}
                                className="min-h-11 w-full truncate px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                                type="button"
                                onClick={() => select(volunteer.id)}
                              >
                                {volunteer.first_name} {volunteer.last_name}
                              </button>
                            </th>
                            <td className="px-3 py-2">
                              {volunteer.family_display_name ? (
                                <Badge className="border-primary/30 bg-primary/10 text-primary">
                                  {volunteer.family_display_name}
                                </Badge>
                              ) : (
                                <span className="text-sm text-muted-foreground">–</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant={volunteer.status === "ACTIVE" ? "success" : "neutral"}
                              >
                                {statusLabels[volunteer.status]}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </section>
        <section
          className={`${selected || creating ? "block" : "hidden lg:block"} min-w-0`}
          aria-label="Helferdetails"
        >
          <Card className={cn("h-full border-border/80", selected && "border-primary/30")}>
            <CardBody>
              {selected || creating ? (
                <Button
                  className="mb-4 px-0 underline lg:hidden"
                  variant="ghost"
                  onClick={() => select(null)}
                >
                  Zurück zu Helfern
                </Button>
              ) : null}
              {creating ? (
                <VolunteerCreateForm
                  org={org}
                  onCancel={() => {
                    setCreating(false);
                    setSuccess(null);
                  }}
                  onCreated={(volunteer) => {
                    const entry: VolunteerDirectoryEntry = {
                      ...volunteer,
                      has_account: false,
                      family_display_name: null,
                    };
                    setVolunteers((current) =>
                      [...current, entry].sort((a, b) => a.last_name.localeCompare(b.last_name)),
                    );
                    setSuccess("Helfer wurde erstellt.");
                    select(volunteer.id, true);
                  }}
                />
              ) : selected ? (
                <VolunteerDetail
                  key={selected.id}
                  org={org}
                  volunteer={selected}
                  onSaved={(updated) =>
                    setVolunteers((current) =>
                      current.map((item) =>
                        item.id === updated.id ? { ...item, ...updated } : item,
                      ),
                    )
                  }
                  onShowFamily={onShowFamily}
                  onDeleted={() => {
                    const deletedId = selected.id;
                    setVolunteers((current) => current.filter((item) => item.id !== deletedId));
                    setSuccess("Helfer wurde gelöscht.");
                    select(null, true);
                  }}
                />
              ) : (
                <p>Wählen Sie einen Helfer aus, um die Details anzuzeigen.</p>
              )}
            </CardBody>
          </Card>
        </section>
      </div>
    </>
  );
}

function VolunteerCreateForm({
  org,
  onCancel,
  onCreated,
}: Readonly<{
  org: string;
  onCancel: () => void;
  onCreated: (volunteer: FamilyVolunteer) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const first = String(data.get("first_name") ?? "").trim();
    const last = String(data.get("last_name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    if (!first || !last || !phone || !email) {
      setError("Vorname, Nachname, Telefon und E-Mail sind erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await createVolunteer(org, {
          first_name: first,
          last_name: last,
          phone,
          email,
          compensation_preference: data.get("compensation_preference") as VolunteerCompensation,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Helfer konnte nicht erstellt werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">Neuer Helfer</h2>
      <form className="mt-4 grid gap-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1" htmlFor="volunteer-first-name">
            Vorname
            <input
              className={control}
              id="volunteer-first-name"
              name="first_name"
              required
              maxLength={100}
              disabled={busy}
            />
          </label>
          <label className="grid gap-1" htmlFor="volunteer-last-name">
            Nachname
            <input
              className={control}
              id="volunteer-last-name"
              name="last_name"
              required
              maxLength={100}
              disabled={busy}
            />
          </label>
        </div>
        <label className="grid gap-1" htmlFor="volunteer-phone">
          Telefon
          <input
            className={control}
            id="volunteer-phone"
            name="phone"
            type="tel"
            required
            maxLength={50}
            disabled={busy}
          />
        </label>
        <label className="grid gap-1" htmlFor="volunteer-email">
          E-Mail
          <input
            className={control}
            id="volunteer-email"
            name="email"
            type="email"
            required
            maxLength={320}
            disabled={busy}
          />
        </label>
        <label className="grid gap-1" htmlFor="volunteer-compensation-preference">
          Einsatzvergütung
          <select
            className={control}
            id="volunteer-compensation-preference"
            name="compensation_preference"
            defaultValue="WORK_HOURS"
            disabled={busy}
          >
            {(Object.keys(compensationLabels) as VolunteerCompensation[]).map((value) => (
              <option key={value} value={value}>
                {compensationLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Wird erstellt …" : "Helfer erstellen"}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </form>
      {error ? (
        <p
          className="mt-3 rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function VolunteerDetail({
  org,
  volunteer,
  onSaved,
  onShowFamily,
  onDeleted,
}: Readonly<{
  org: string;
  volunteer: VolunteerDirectoryEntry;
  onSaved: (volunteer: FamilyVolunteer) => void;
  onShowFamily: (familyId: string) => void;
  onDeleted: () => void;
}>) {
  const [family, setFamily] = useState<VolunteerFamily | null | undefined>(undefined);
  const [familyError, setFamilyError] = useState<string | null>(null);

  const refreshFamily = useCallback(async () => {
    setFamilyError(null);
    try {
      setFamily(await loadVolunteerFamily(org, volunteer.id));
    } catch (caught) {
      setFamilyError(
        caught instanceof Error ? caught.message : "Die Familie konnte nicht geladen werden.",
      );
      setFamily(null);
    }
  }, [org, volunteer.id]);

  useEffect(() => {
    setFamily(undefined);
    void refreshFamily();
  }, [refreshFamily]);

  const childMembers: FamilyMember[] = (family?.members ?? [])
    .filter((member) => member.member_type === "CHILD")
    .map((member) => ({
      id: member.id,
      family_id: family?.family_id ?? "",
      member_type: "CHILD",
      first_name: member.first_name,
      last_name: member.last_name,
      volunteer_id: member.volunteer_id,
      team_name: member.team_name,
    }));

  return (
    <div>
      <h2 className="text-xl font-semibold">
        {volunteer.first_name} {volunteer.last_name}
      </h2>
      <VolunteerKartei
        org={org}
        volunteer={volunteer}
        childMembers={childMembers}
        onSaved={onSaved}
        startEditing
      />
      <section className="mt-5 border-t pt-4" aria-labelledby={`family-heading-${volunteer.id}`}>
        <h3 id={`family-heading-${volunteer.id}`} className="font-semibold">
          Familie
        </h3>
        {family === undefined ? (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            Familie wird geladen …
          </p>
        ) : familyError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-status-error" role="alert">
              {familyError}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void refreshFamily()}>
              Erneut versuchen
            </Button>
          </div>
        ) : family ? (
          <div className="mt-2 grid gap-2">
            <button type="button" className="w-fit" onClick={() => onShowFamily(family.family_id)}>
              <Badge className="border-primary/30 bg-primary/10 text-primary">
                Familie: {family.family_display_name}
              </Badge>
            </button>
            <ul
              className="grid gap-2"
              aria-label={`Mitglieder der Familie ${family.family_display_name}`}
            >
              {family.members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <span>
                    {member.member_type === "HELPER"
                      ? `${member.volunteer_first_name ?? member.first_name} ${
                          member.volunteer_last_name ?? member.last_name
                        }`
                      : `${member.first_name} ${member.last_name}`}
                    {member.member_type === "CHILD" && member.team_name
                      ? ` · ${member.team_name}`
                      : ""}
                  </span>
                  <Badge
                    className={
                      member.member_type === "HELPER"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : undefined
                    }
                    variant="neutral"
                  >
                    {memberTypeLabels[member.member_type]}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-2 grid gap-2">
            <p className="text-sm text-muted-foreground">Noch nicht mit einer Familie verknüpft.</p>
            <LinkVolunteerToFamily
              org={org}
              volunteer={volunteer}
              onLinked={() => void refreshFamily()}
            />
          </div>
        )}
      </section>
      <VolunteerPasswordActions org={org} volunteer={volunteer} />
      <VolunteerDeleteAction org={org} volunteer={volunteer} onDeleted={onDeleted} />
    </div>
  );
}

function VolunteerDeleteAction({
  org,
  volunteer,
  onDeleted,
}: Readonly<{ org: string; volunteer: VolunteerDirectoryEntry; onDeleted: () => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `${volunteer.first_name} ${volunteer.last_name} endgültig löschen? Dies kann nicht rückgängig gemacht werden.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await deleteVolunteer(org, volunteer.id);
      onDeleted();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Helfer konnte nicht gelöscht werden.",
      );
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 border-t pt-4" aria-labelledby={`delete-heading-${volunteer.id}`}>
      <h3 id={`delete-heading-${volunteer.id}`} className="font-semibold">
        Helfer löschen
      </h3>
      <Button
        className="mt-3"
        type="button"
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={() => void remove()}
      >
        {busy ? "Wird gelöscht …" : "Helfer endgültig löschen"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Entfernt den Helfer dauerhaft. Nicht möglich, solange Anmeldungen oder Arbeitszeiten
        bestehen — in dem Fall den Helfer stattdessen auf „Inaktiv&rdquo; setzen.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function LinkVolunteerToFamily({
  org,
  volunteer,
  onLinked,
}: Readonly<{ org: string; volunteer: FamilyVolunteer; onLinked: () => void }>) {
  const [families, setFamilies] = useState<FamilyListItem[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [newFamilyName, setNewFamilyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFamilies(org)
      .then((loaded) => {
        if (!cancelled) setFamilies(loaded);
      })
      .catch(() => {
        // The picker is a convenience; creating a brand-new family still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [org]);

  async function linkToFamily(familyId: string) {
    setBusy(true);
    setError(null);
    try {
      const member = await createFamilyMember(org, familyId, {
        member_type: "HELPER",
        first_name: volunteer.first_name,
        last_name: volunteer.last_name,
      });
      await updateFamilyMemberVolunteer(org, familyId, member.id, volunteer.id);
      onLinked();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Verknüpfung ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function createAndLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFamilyName.trim();
    if (!name) {
      setError("Der Familienname ist erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const family = await createFamily(org, { display_name: name, internal_note: null });
      await linkToFamily(family.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Familie konnte nicht erstellt werden.",
      );
      setBusy(false);
    }
  }

  return (
    <details className="rounded-md border border-primary/20 bg-primary/5 p-3">
      <summary className="cursor-pointer font-medium">Mit Familie verknüpfen</summary>
      <div className="mt-3 grid gap-2">
        <label className="grid gap-1 text-sm" htmlFor={`link-existing-family-${volunteer.id}`}>
          Bestehende Familie
          <select
            className={control}
            id={`link-existing-family-${volunteer.id}`}
            value={selectedFamilyId}
            onChange={(event) => setSelectedFamilyId(event.target.value)}
            disabled={busy}
          >
            <option value="">Familie wählen</option>
            {families.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={busy || !selectedFamilyId}
          onClick={() => void linkToFamily(selectedFamilyId)}
        >
          Verknüpfen
        </Button>
      </div>
      <form className="mt-3 grid gap-2 border-t pt-3" onSubmit={createAndLink}>
        <label className="grid gap-1 text-sm" htmlFor={`link-new-family-${volunteer.id}`}>
          Neue Familie
          <input
            className={control}
            id={`link-new-family-${volunteer.id}`}
            value={newFamilyName}
            onChange={(event) => setNewFamilyName(event.target.value)}
            maxLength={160}
            disabled={busy}
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Familie erstellen &amp; verknüpfen
        </Button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
    </details>
  );
}

function VolunteerPasswordActions({
  org,
  volunteer,
}: Readonly<{ org: string; volunteer: VolunteerDirectoryEntry }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settingPassword, setSettingPassword] = useState(false);

  async function sendReset() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await sendVolunteerPasswordReset(org, volunteer.id);
      setSuccess("Der Link zum Zurücksetzen des Passworts wurde gesendet.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Reset-Link konnte nicht gesendet werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("new_password") ?? "");
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await setVolunteerPassword(org, volunteer.id, password);
      setSuccess("Das neue Passwort wurde gesetzt.");
      setSettingPassword(false);
      form.reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Das Passwort konnte nicht gesetzt werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!volunteer.has_account) {
    return (
      <section className="mt-5 border-t pt-4" aria-labelledby={`account-heading-${volunteer.id}`}>
        <h3 id={`account-heading-${volunteer.id}`} className="font-semibold">
          Konto
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {volunteer.first_name} {volunteer.last_name} hat noch kein eigenes Helferkonto.
          Passwortaktionen sind erst nach einer eigenen Registrierung mit dieser E-Mail-Adresse
          möglich.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-5 border-t pt-4" aria-labelledby={`password-heading-${volunteer.id}`}>
      <h3 id={`password-heading-${volunteer.id}`} className="font-semibold">
        Passwort
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void sendReset()}>
          Reset-Link senden
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => setSettingPassword((current) => !current)}
        >
          Passwort direkt setzen
        </Button>
      </div>
      {settingPassword ? (
        <form className="mt-3 grid gap-2" onSubmit={submitNewPassword}>
          <label className="grid gap-1 text-sm" htmlFor={`new-password-${volunteer.id}`}>
            Neues Passwort
            <input
              className={control}
              id={`new-password-${volunteer.id}`}
              name="new_password"
              type="password"
              minLength={10}
              required
              disabled={busy}
              autoComplete="new-password"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Wird gespeichert …" : "Passwort setzen"}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-2 text-sm" role="status">
          {success}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Familien (secondary): the original family-first browse view, kept for
// continuity and for editing family-level fields and members.
// ---------------------------------------------------------------------------

function FamiliesView({ org }: Readonly<{ org: string }>) {
  const [families, setFamilies] = useState<FamilyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => queryParam("family"));
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, FamilyMember[]>>({});
  const cacheMembers = useCallback((familyId: string, members: FamilyMember[]) => {
    setCache((current) => ({ ...current, [familyId]: members }));
    setFamilies((current) =>
      current.map((family) =>
        family.id === familyId
          ? {
              ...family,
              children_count: members.filter((member) => member.member_type === "CHILD").length,
              helpers_count: members.filter((member) => member.member_type === "HELPER").length,
            }
          : family,
      ),
    );
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const loadedFamilies = await loadFamilies(org);
      setFamilies(loadedFamilies);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Familien konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const sync = () => {
      setSelectedId(queryParam("family"));
      setCreating(false);
      setSuccess(null);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const selected = families.find((family) => family.id === selectedId) ?? null;
  const filtered = useMemo(
    () =>
      families.filter((family) =>
        family.display_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ),
    [families, search],
  );

  function select(id: string | null, preserveSuccess = false) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("family", id);
    else url.searchParams.delete("family");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSelectedId(id);
    setCreating(false);
    if (!preserveSuccess) setSuccess(null);
  }

  return (
    <>
      <PageHeader
        title="Familien"
        description="Aktive Familien und ihre Mitglieder verwalten."
        action={
          <Button
            onClick={() => {
              setCreating(true);
              setSelectedId(null);
              setSuccess(null);
            }}
          >
            Neue Familie
          </Button>
        }
      />
      {error ? (
        <p
          className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-md border border-status-success/30 bg-status-success/5 p-3 text-sm text-status-success"
          role="status"
        >
          {success}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <section
          className={`${selected || creating ? "hidden lg:block" : "block"} min-w-0`}
          aria-label="Familienliste"
        >
          <Card className="h-full border-border/80">
            <CardBody>
              <label className="grid gap-1" htmlFor="family-search">
                Familien suchen
                <input
                  className={control}
                  id="family-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {search ? (
                <Button
                  className="mt-2 px-0 underline"
                  variant="ghost"
                  onClick={() => setSearch("")}
                >
                  Suche löschen
                </Button>
              ) : null}
              {loading ? (
                <p className="mt-4" role="status">
                  Familien werden geladen …
                </p>
              ) : families.length === 0 ? (
                <p className="mt-4">Noch keine Familien vorhanden.</p>
              ) : filtered.length === 0 ? (
                <p className="mt-4">Keine Familien für diese Suche gefunden.</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-md border">
                  <table className="w-full border-collapse text-left" aria-label="Aktive Familien">
                    <thead className="bg-muted/60 text-sm text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Familie
                        </th>
                        <th className="px-3 py-2 text-right font-medium" scope="col">
                          Kinder
                        </th>
                        <th className="px-3 py-2 text-right font-medium" scope="col">
                          Helfer
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((family) => {
                        const active = selected?.id === family.id;
                        return (
                          <tr
                            className={cn(
                              "border-t transition-colors",
                              active ? "bg-primary/5" : "hover:bg-muted/40",
                            )}
                            key={family.id}
                          >
                            <th className="p-0 font-medium" scope="row">
                              <button
                                aria-current={active ? "true" : undefined}
                                className="min-h-11 w-full px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                                type="button"
                                onClick={() => select(family.id)}
                              >
                                {family.display_name}
                              </button>
                            </th>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {family.children_count}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {family.helpers_count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </section>
        <section
          className={`${selected || creating ? "block" : "hidden lg:block"} min-w-0`}
          aria-label="Familiendetails"
        >
          <Card className={cn("h-full border-border/80", selected && "border-primary/30")}>
            <CardBody>
              {selected || creating ? (
                <Button
                  className="mb-4 px-0 underline lg:hidden"
                  variant="ghost"
                  onClick={() => select(null)}
                >
                  Zurück zu Familien
                </Button>
              ) : null}
              {creating ? (
                <FamilyForm
                  org={org}
                  onCancel={() => {
                    setCreating(false);
                    setSuccess(null);
                  }}
                  onCreated={(family) => {
                    setFamilies((items) =>
                      [...items, { ...family, children_count: 0, helpers_count: 0 }].sort((a, b) =>
                        a.display_name.localeCompare(b.display_name),
                      ),
                    );
                    setSuccess("Familie wurde erstellt.");
                    select(family.id, true);
                  }}
                />
              ) : selected ? (
                <FamilyDetail
                  key={selected.id}
                  family={selected}
                  org={org}
                  members={cache[selected.id]}
                  onMembers={cacheMembers}
                />
              ) : (
                <p>Wählen Sie eine Familie aus, um die Details anzuzeigen.</p>
              )}
            </CardBody>
          </Card>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Kinder (secondary): org-wide child roster with family and compensation
// cross-reference, read-only (children are created/edited via Familien or
// by the volunteer themselves in their self-service profile).
// ---------------------------------------------------------------------------

function ChildrenView({
  org,
  onShowFamily,
  onShowVolunteer,
}: Readonly<{
  org: string;
  onShowFamily: (familyId: string) => void;
  onShowVolunteer: (volunteerId: string) => void;
}>) {
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [volunteers, setVolunteers] = useState<FamilyVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => queryParam("child"));

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [loadedChildren, loadedVolunteers] = await Promise.all([
        loadFamilyChildren(org),
        loadFamilyVolunteers(org),
      ]);
      setChildren(loadedChildren);
      setVolunteers(loadedVolunteers);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Kinder konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const sync = () => setSelectedId(queryParam("child"));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const selected = children.find((child) => child.id === selectedId) ?? null;
  const filtered = useMemo(
    () =>
      children.filter((child) =>
        `${child.first_name} ${child.last_name}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      ),
    [children, search],
  );

  function select(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("child", id);
    else url.searchParams.delete("child");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSelectedId(id);
  }

  function creditedBy(childId: string): FamilyVolunteer[] {
    return volunteers.filter((volunteer) => volunteer.compensation_family_member_id === childId);
  }

  return (
    <>
      <PageHeader
        title="Kinder"
        description="Alle Kinder der Organisation durchsuchen und ihre Vergütungszuordnung einsehen."
      />
      {error ? (
        <p
          className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(22rem,34rem)_minmax(0,1fr)]">
        <section
          className={`${selected ? "hidden lg:block" : "block"} min-w-0`}
          aria-label="Kinderliste"
        >
          <Card className="h-full border-border/80">
            <CardBody>
              <label className="grid gap-1" htmlFor="child-search">
                Kinder suchen
                <input
                  className={control}
                  id="child-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {search ? (
                <Button
                  className="mt-2 px-0 underline"
                  variant="ghost"
                  onClick={() => setSearch("")}
                >
                  Suche löschen
                </Button>
              ) : null}
              {loading ? (
                <p className="mt-4" role="status">
                  Kinder werden geladen …
                </p>
              ) : children.length === 0 ? (
                <p className="mt-4">Noch keine Kinder vorhanden.</p>
              ) : filtered.length === 0 ? (
                <p className="mt-4">Keine Kinder für diese Suche gefunden.</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-md border">
                  <table
                    className="w-full table-fixed border-collapse text-left"
                    aria-label="Kinder"
                  >
                    <colgroup>
                      <col className="w-[45%]" />
                      <col className="w-[35%]" />
                      <col className="w-[20%]" />
                    </colgroup>
                    <thead className="bg-muted/60 text-sm text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Kind
                        </th>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Familie
                        </th>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Mannschaft
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((child) => {
                        const active = selected?.id === child.id;
                        return (
                          <tr
                            className={cn(
                              "border-t transition-colors",
                              active ? "bg-primary/5" : "hover:bg-muted/40",
                            )}
                            key={child.id}
                          >
                            <th className="p-0 font-medium" scope="row">
                              <button
                                aria-current={active ? "true" : undefined}
                                className="min-h-11 w-full truncate px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                                type="button"
                                onClick={() => select(child.id)}
                              >
                                {child.first_name} {child.last_name}
                              </button>
                            </th>
                            <td className="px-3 py-2">
                              <Badge className="border-primary/30 bg-primary/10 text-primary">
                                {child.family_display_name}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-sm text-muted-foreground">
                              {child.team_name ?? "–"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </section>
        <section
          className={`${selected ? "block" : "hidden lg:block"} min-w-0`}
          aria-label="Kinderdetails"
        >
          <Card className={cn("h-full border-border/80", selected && "border-primary/30")}>
            <CardBody>
              {selected ? (
                <Button
                  className="mb-4 px-0 underline lg:hidden"
                  variant="ghost"
                  onClick={() => select(null)}
                >
                  Zurück zu Kindern
                </Button>
              ) : null}
              {selected ? (
                <div>
                  <h2 className="text-xl font-semibold">
                    {selected.first_name} {selected.last_name}
                  </h2>
                  <div className="mt-2 grid gap-2">
                    <button
                      type="button"
                      className="w-fit"
                      onClick={() => onShowFamily(selected.family_id)}
                    >
                      <Badge className="border-primary/30 bg-primary/10 text-primary">
                        Familie: {selected.family_display_name}
                      </Badge>
                    </button>
                    <p className="text-sm text-muted-foreground">
                      Mannschaft: {selected.team_name ?? "Keine Angabe"}
                    </p>
                  </div>
                  <section
                    className="mt-5 border-t pt-4"
                    aria-labelledby={`compensation-heading-${selected.id}`}
                  >
                    <h3 id={`compensation-heading-${selected.id}`} className="font-semibold">
                      Vergütung
                    </h3>
                    {loading ? (
                      <p className="mt-2 text-sm text-muted-foreground" role="status">
                        Wird geladen …
                      </p>
                    ) : creditedBy(selected.id).length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Noch keinem Helfer für die Vergütung zugeordnet.
                      </p>
                    ) : (
                      <ul
                        className="mt-2 grid gap-2"
                        aria-label={`Vergütung für ${selected.first_name} ${selected.last_name}`}
                      >
                        {creditedBy(selected.id).map((volunteer) => (
                          <li
                            key={volunteer.id}
                            className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                          >
                            <button
                              type="button"
                              className="text-left underline"
                              onClick={() => onShowVolunteer(volunteer.id)}
                            >
                              {volunteer.first_name} {volunteer.last_name}
                            </button>
                            <Badge variant="neutral">
                              {compensationLabels[volunteer.compensation_preference]}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              ) : (
                <p>Wählen Sie ein Kind aus, um die Details anzuzeigen.</p>
              )}
            </CardBody>
          </Card>
        </section>
      </div>
    </>
  );
}

function FamilyForm({
  org,
  onCancel,
  onCreated,
}: Readonly<{ org: string; onCancel: () => void; onCreated: (family: Family) => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("display_name") ?? "").trim();
    if (!name) {
      setError("Der Familienname ist erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await createFamily(org, {
          display_name: name,
          internal_note: String(data.get("internal_note") ?? "") || null,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Familie konnte nicht erstellt werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h2 className="text-xl font-semibold">Neue Familie</h2>
      <form className="mt-4 grid gap-3" onSubmit={submit}>
        <label className="grid gap-1" htmlFor="family-display-name">
          Familienname
          <input
            className={control}
            id="family-display-name"
            name="display_name"
            required
            maxLength={160}
            disabled={busy}
          />
        </label>
        <label className="grid gap-1" htmlFor="family-internal-note">
          Interne Notiz (optional)
          <textarea
            className={control}
            id="family-internal-note"
            name="internal_note"
            rows={2}
            disabled={busy}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Wird erstellt …" : "Familie erstellen"}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </form>
      {error ? (
        <p
          className="mt-3 rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FamilyDetail({
  family,
  org,
  members,
  onMembers,
}: Readonly<{
  family: Family;
  org: string;
  members: FamilyMember[] | undefined;
  onMembers: (familyId: string, members: FamilyMember[]) => void;
}>) {
  const [loading, setLoading] = useState(members === undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<FamilyVolunteer[]>([]);
  const [volunteersLoading, setVolunteersLoading] = useState(true);
  const [volunteersError, setVolunteersError] = useState<string | null>(null);
  const [volunteerSearch, setVolunteerSearch] = useState<Record<string, string>>({});
  const [memberType, setMemberType] = useState<FamilyMemberType>("CHILD");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      onMembers(family.id, await loadFamilyMembers(org, family.id));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Familienmitglieder konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [family.id, onMembers, org]);
  useEffect(() => {
    if (members === undefined) void refresh();
  }, [members, refresh]);
  const refreshVolunteers = useCallback(async () => {
    setVolunteersLoading(true);
    setVolunteersError(null);
    try {
      setVolunteers(await loadFamilyVolunteers(org));
    } catch (caught) {
      setVolunteersError(
        caught instanceof Error ? caught.message : "Die Volunteers konnten nicht geladen werden.",
      );
    } finally {
      setVolunteersLoading(false);
    }
  }, [org]);
  useEffect(() => void refreshVolunteers(), [refreshVolunteers]);

  async function saveVolunteer(member: FamilyMember, volunteerId: string | null) {
    if (
      volunteerId === null &&
      member.volunteer_id !== null &&
      !window.confirm(`Verknüpfung von ${member.first_name} ${member.last_name} entfernen?`)
    )
      return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await updateFamilyMemberVolunteer(org, family.id, member.id, volunteerId);
      setSuccess(
        volunteerId === null
          ? "Volunteer-Verknüpfung wurde entfernt."
          : member.volunteer_id
            ? "Volunteer-Verknüpfung wurde ersetzt."
            : "Volunteer wurde verknüpft.",
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Volunteer-Verknüpfung konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const first = String(data.get("first_name") ?? "").trim();
    const last = String(data.get("last_name") ?? "").trim();
    if (!first || !last) {
      setError("Vorname und Nachname sind erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const submittedType = data.get("member_type") as FamilyMemberType;
      await createFamilyMember(org, family.id, {
        member_type: submittedType,
        first_name: first,
        last_name: last,
        ...(submittedType === "CHILD"
          ? { team_name: String(data.get("team_name") ?? "").trim() || null }
          : {}),
      });
      form.reset();
      setMemberType("CHILD");
      setSuccess("Familienmitglied wurde erstellt.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Das Familienmitglied konnte nicht erstellt werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h2 className="text-xl font-semibold">{family.display_name}</h2>
      {family.internal_note ? (
        <p className="mt-1 text-sm text-muted-foreground">{family.internal_note}</p>
      ) : null}
      <section className="mt-5 border-t pt-4" aria-labelledby="members-heading">
        <h3 id="members-heading" className="font-semibold">
          Familienmitglieder
        </h3>
        <details className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
          <summary className="cursor-pointer font-medium">Mitglied erstellen</summary>
          <form className="mt-3 grid gap-3" onSubmit={submit}>
            <label className="grid gap-1" htmlFor="member-type">
              Mitgliedstyp
              <select
                className={control}
                id="member-type"
                name="member_type"
                value={memberType}
                onChange={(event) => setMemberType(event.target.value as FamilyMemberType)}
                disabled={busy}
              >
                <option value="CHILD">Kind</option>
                <option value="HELPER">Helfer</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1" htmlFor="member-first">
                Vorname
                <input
                  className={control}
                  id="member-first"
                  name="first_name"
                  required
                  maxLength={100}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1" htmlFor="member-last">
                Nachname
                <input
                  className={control}
                  id="member-last"
                  name="last_name"
                  required
                  maxLength={100}
                  disabled={busy}
                />
              </label>
            </div>
            {memberType === "CHILD" ? (
              <label className="grid gap-1" htmlFor="member-team-name">
                Mannschaft (optional)
                <input
                  className={control}
                  id="member-team-name"
                  name="team_name"
                  maxLength={100}
                  disabled={busy}
                />
              </label>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Wird erstellt …" : "Mitglied erstellen"}
            </Button>
          </form>
        </details>
        {error ? (
          <p
            className="mt-3 rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-3 text-sm" role="status">
            {success}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-3" role="status">
            Familienmitglieder werden geladen …
          </p>
        ) : members?.length === 0 ? (
          <p className="mt-3">Noch keine Familienmitglieder vorhanden.</p>
        ) : (
          <ul className="mt-3 grid gap-2" aria-label={`Mitglieder von ${family.display_name}`}>
            {members?.map((member) => (
              <li key={member.id}>
                <Card className="shadow-none">
                  <CardBody className="grid gap-3 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        {member.first_name} {member.last_name}
                        {member.member_type === "CHILD" && member.team_name
                          ? ` · ${member.team_name}`
                          : ""}
                      </span>
                      <Badge
                        className={
                          member.member_type === "HELPER"
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : undefined
                        }
                        variant="neutral"
                      >
                        {memberTypeLabels[member.member_type]}
                      </Badge>
                    </div>
                    {member.member_type === "HELPER" ? (
                      <div className="grid gap-3 border-t pt-3">
                        {member.volunteer_id ? (
                          volunteersLoading ? (
                            <p className="text-sm text-muted-foreground" role="status">
                              Helferdaten werden geladen …
                            </p>
                          ) : volunteers.find((item) => item.id === member.volunteer_id) ? (
                            <VolunteerKartei
                              org={org}
                              volunteer={volunteers.find(
                                (item) => item.id === member.volunteer_id,
                              )!}
                              childMembers={members?.filter((m) => m.member_type === "CHILD") ?? []}
                              onSaved={(updated) =>
                                setVolunteers((current) =>
                                  current.map((item) => (item.id === updated.id ? updated : item)),
                                )
                              }
                            />
                          ) : (
                            <p className="text-sm font-medium">
                              Verknüpft mit einem nicht mehr aktiven Volunteer
                            </p>
                          )
                        ) : (
                          <p className="text-sm font-medium">
                            Noch nicht mit einem Volunteer verknüpft
                          </p>
                        )}
                        {volunteersLoading ? (
                          <p className="text-sm text-muted-foreground" role="status">
                            Volunteers werden geladen …
                          </p>
                        ) : volunteersError ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm text-status-error" role="alert">
                              {volunteersError}
                            </p>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void refreshVolunteers()}
                            >
                              Erneut versuchen
                            </Button>
                          </div>
                        ) : volunteers.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Keine aktiven Volunteers verfügbar.
                          </p>
                        ) : (
                          <details>
                            <summary className="cursor-pointer text-sm font-medium">
                              Verknüpfung ändern
                            </summary>
                            <div className="mt-2 grid gap-2">
                              <label
                                className="grid gap-1 text-sm"
                                htmlFor={`volunteer-search-${member.id}`}
                              >
                                Volunteer suchen
                                <input
                                  className={control}
                                  id={`volunteer-search-${member.id}`}
                                  value={volunteerSearch[member.id] ?? ""}
                                  onChange={(event) =>
                                    setVolunteerSearch((current) => ({
                                      ...current,
                                      [member.id]: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label
                                className="grid gap-1 text-sm"
                                htmlFor={`volunteer-link-${member.id}`}
                              >
                                Volunteer für {member.first_name} {member.last_name}
                                <select
                                  className={control}
                                  id={`volunteer-link-${member.id}`}
                                  value={member.volunteer_id ?? ""}
                                  disabled={busy}
                                  onChange={(event) =>
                                    void saveVolunteer(member, event.target.value || null)
                                  }
                                >
                                  <option value="">Keine Verknüpfung</option>
                                  {volunteers
                                    .filter(
                                      (item) =>
                                        (item.status === "ACTIVE" ||
                                          item.id === member.volunteer_id) &&
                                        (item.id === member.volunteer_id ||
                                          `${item.first_name} ${item.last_name}`
                                            .toLocaleLowerCase()
                                            .includes(
                                              (volunteerSearch[member.id] ?? "")
                                                .trim()
                                                .toLocaleLowerCase(),
                                            )),
                                    )
                                    .map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.first_name} {item.last_name}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            </div>
                          </details>
                        )}
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function VolunteerKartei({
  org,
  volunteer,
  childMembers,
  onSaved,
  startEditing = false,
}: Readonly<{
  org: string;
  volunteer: FamilyVolunteer;
  childMembers: FamilyMember[];
  onSaved: (volunteer: FamilyVolunteer) => void;
  startEditing?: boolean;
}>) {
  const [editing, setEditing] = useState(startEditing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload: FamilyVolunteerUpdate = {
      first_name: String(data.get("first_name") ?? "").trim(),
      last_name: String(data.get("last_name") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      compensation_preference: data.get("compensation_preference") as VolunteerCompensation,
      compensation_family_member_id:
        String(data.get("compensation_family_member_id") ?? "") || null,
      internal_note: String(data.get("internal_note") ?? "").trim() || null,
      status: data.get("status") as VolunteerStatus,
    };
    if (!payload.first_name || !payload.last_name || !payload.email) {
      setError("Vorname, Nachname und E-Mail sind erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateFamilyVolunteer(org, volunteer.id, payload));
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Helferdaten konnten nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="grid gap-1 rounded-md border bg-background p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">
            {volunteer.first_name} {volunteer.last_name}
          </p>
          <div className="flex items-center gap-2">
            {volunteer.status === "INACTIVE" ? <Badge variant="neutral">Inaktiv</Badge> : null}
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground">
          {volunteer.phone} · {volunteer.email}
        </p>
        <p className="text-muted-foreground">
          Vergütung: {compensationLabels[volunteer.compensation_preference]}
          {volunteer.compensation_family_member_id
            ? ` für ${
                childMembers.find((child) => child.id === volunteer.compensation_family_member_id)
                  ?.first_name ?? "ein Kind"
              }`
            : ""}
        </p>
        {volunteer.internal_note ? (
          <p className="text-muted-foreground">Notiz: {volunteer.internal_note}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form className="grid gap-3 rounded-md border bg-background p-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm" htmlFor={`kartei-first-${volunteer.id}`}>
          Vorname
          <input
            className={control}
            id={`kartei-first-${volunteer.id}`}
            name="first_name"
            defaultValue={volunteer.first_name}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`kartei-last-${volunteer.id}`}>
          Nachname
          <input
            className={control}
            id={`kartei-last-${volunteer.id}`}
            name="last_name"
            defaultValue={volunteer.last_name}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm" htmlFor={`kartei-phone-${volunteer.id}`}>
        Telefon
        <input
          className={control}
          id={`kartei-phone-${volunteer.id}`}
          name="phone"
          defaultValue={volunteer.phone}
          maxLength={50}
          required
          disabled={busy}
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor={`kartei-email-${volunteer.id}`}>
        E-Mail
        <input
          className={control}
          id={`kartei-email-${volunteer.id}`}
          name="email"
          type="email"
          defaultValue={volunteer.email}
          maxLength={320}
          required
          disabled={busy}
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor={`kartei-compensation-${volunteer.id}`}>
        Einsatzvergütung
        <select
          className={control}
          id={`kartei-compensation-${volunteer.id}`}
          name="compensation_preference"
          defaultValue={volunteer.compensation_preference}
          disabled={busy}
        >
          {(Object.keys(compensationLabels) as VolunteerCompensation[]).map((value) => (
            <option key={value} value={value}>
              {compensationLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm" htmlFor={`kartei-child-${volunteer.id}`}>
        Kind für Vergütung (optional)
        <select
          className={control}
          id={`kartei-child-${volunteer.id}`}
          name="compensation_family_member_id"
          defaultValue={volunteer.compensation_family_member_id ?? ""}
          disabled={busy}
        >
          <option value="">Kein Kind</option>
          {childMembers.map((child) => (
            <option key={child.id} value={child.id}>
              {child.first_name} {child.last_name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm" htmlFor={`kartei-note-${volunteer.id}`}>
        Interne Notiz
        <textarea
          className={control}
          id={`kartei-note-${volunteer.id}`}
          name="internal_note"
          defaultValue={volunteer.internal_note ?? ""}
          rows={2}
          disabled={busy}
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor={`kartei-status-${volunteer.id}`}>
        Status
        <select
          className={control}
          id={`kartei-status-${volunteer.id}`}
          name="status"
          defaultValue={volunteer.status}
          disabled={busy}
        >
          {(Object.keys(statusLabels) as VolunteerStatus[]).map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Wird gespeichert …" : "Speichern"}
        </Button>
        {startEditing ? null : (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Abbrechen
          </Button>
        )}
      </div>
    </form>
  );
}
