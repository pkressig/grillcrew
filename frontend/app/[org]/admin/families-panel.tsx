"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  createFamily,
  createFamilyMember,
  loadFamilies,
  loadFamilyMembers,
  type Family,
  type FamilyMember,
  type FamilyMemberType,
} from "@/lib/families";
import { cn } from "@/lib/utils";

const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
const labels: Record<FamilyMemberType, string> = { CHILD: "Kind", HELPER: "Helfer" };

function queryFamily() {
  return typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("family");
}

export function FamiliesPanel({ org }: Readonly<{ org: string }>) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(queryFamily);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, FamilyMember[]>>({});
  const cacheMembers = useCallback(
    (familyId: string, members: FamilyMember[]) =>
      setCache((current) => ({ ...current, [familyId]: members })),
    [],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setFamilies(await loadFamilies(org));
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
      setSelectedId(queryFamily());
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
    <section className="grid gap-6" aria-labelledby="families-heading">
      <PageHeader
        headingId="families-heading"
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
          <Card className="h-full">
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
                <ul className="mt-4 grid gap-2" aria-label="Aktive Familien">
                  {filtered.map((family) => (
                    <li key={family.id}>
                      <Card
                        className={cn(
                          "overflow-hidden shadow-none transition-colors",
                          selected?.id === family.id
                            ? "border-primary bg-primary/5 shadow-card"
                            : "hover:border-primary/40",
                        )}
                      >
                        <button
                          aria-current={selected?.id === family.id ? "true" : undefined}
                          className="min-h-11 w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                          type="button"
                          onClick={() => select(family.id)}
                        >
                          <span className="font-medium">{family.display_name}</span>
                        </button>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </section>
        <section
          className={`${selected || creating ? "block" : "hidden lg:block"} min-w-0`}
          aria-label="Familiendetails"
        >
          <Card className={cn("h-full", selected && "border-primary/30")}>
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
                      [...items, family].sort((a, b) =>
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
    </section>
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
      await createFamilyMember(org, family.id, {
        member_type: data.get("member_type") as FamilyMemberType,
        first_name: first,
        last_name: last,
      });
      form.reset();
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
              <select className={control} id="member-type" name="member_type" disabled={busy}>
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
                  <CardBody className="flex items-center justify-between gap-3 p-3">
                    <span>
                      {member.first_name} {member.last_name}
                    </span>
                    <Badge
                      className={
                        member.member_type === "HELPER"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : undefined
                      }
                      variant="neutral"
                    >
                      {labels[member.member_type]}
                    </Badge>
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
