"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createFamily,
  createFamilyMember,
  loadFamilies,
  loadFamilyMembers,
  type Family,
  type FamilyMember,
  type FamilyMemberType,
} from "@/lib/families";

const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-md border px-4 font-medium disabled:opacity-50";

export function FamiliesPanel({ org }: Readonly<{ org: string }>) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get("display_name") ?? "").trim();
    if (!displayName) {
      setSuccess(null);
      setError("Der Familienname ist erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await createFamily(org, {
        display_name: displayName,
        internal_note: String(data.get("internal_note") ?? "") || null,
      });
      form.reset();
      setSuccess("Familie wurde erstellt.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Familie konnte nicht erstellt werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border p-5" aria-labelledby="families-heading">
      <h2 id="families-heading" className="text-lg font-semibold">
        Familien
      </h2>
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
        <button className={button} type="submit" disabled={busy}>
          {busy ? "Wird erstellt …" : "Familie erstellen"}
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 text-sm" role="status">
          {success}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-4" role="status">
          Familien werden geladen …
        </p>
      ) : families.length === 0 ? (
        <p className="mt-4">Noch keine Familien vorhanden.</p>
      ) : (
        <ul className="mt-4 grid gap-3" aria-label="Aktive Familien">
          {families.map((family) => (
            <li className="rounded border p-3" key={family.id}>
              <h3 className="font-medium">{family.display_name}</h3>
              {family.internal_note ? (
                <p className="mt-1 text-sm text-muted-foreground">{family.internal_note}</p>
              ) : null}
              <FamilyMembers family={family} org={org} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const memberTypeLabels: Record<FamilyMemberType, string> = {
  CHILD: "Kind",
  HELPER: "Helfer",
};

function FamilyMembers({ family, org }: Readonly<{ family: Family; org: string }>) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fieldPrefix = `family-${family.id}-member`;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setMembers(await loadFamilyMembers(org, family.id));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Familienmitglieder konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [family.id, org]);

  useEffect(() => void refresh(), [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const firstName = String(data.get("first_name") ?? "").trim();
    const lastName = String(data.get("last_name") ?? "").trim();
    if (!firstName || !lastName) {
      setSuccess(null);
      setError("Vorname und Nachname sind erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await createFamilyMember(org, family.id, {
        member_type: data.get("member_type") as FamilyMemberType,
        first_name: firstName,
        last_name: lastName,
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
    <section className="mt-4 border-t pt-4" aria-labelledby={`${fieldPrefix}-heading`}>
      <h4 id={`${fieldPrefix}-heading`} className="font-medium">
        Familienmitglieder
      </h4>
      <form className="mt-3 grid gap-3" onSubmit={submit}>
        <label className="grid gap-1" htmlFor={`${fieldPrefix}-type`}>
          Mitgliedstyp
          <select className={control} id={`${fieldPrefix}-type`} name="member_type" disabled={busy}>
            <option value="CHILD">Kind</option>
            <option value="HELPER">Helfer</option>
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1" htmlFor={`${fieldPrefix}-first-name`}>
            Vorname
            <input
              className={control}
              id={`${fieldPrefix}-first-name`}
              name="first_name"
              required
              maxLength={100}
              disabled={busy}
            />
          </label>
          <label className="grid gap-1" htmlFor={`${fieldPrefix}-last-name`}>
            Nachname
            <input
              className={control}
              id={`${fieldPrefix}-last-name`}
              name="last_name"
              required
              maxLength={100}
              disabled={busy}
            />
          </label>
        </div>
        <button className={button} type="submit" disabled={busy}>
          {busy ? "Wird erstellt …" : "Mitglied erstellen"}
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
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
      ) : members.length === 0 ? (
        <p className="mt-3">Noch keine Familienmitglieder vorhanden.</p>
      ) : (
        <ul className="mt-3 grid gap-2" aria-label={`Mitglieder von ${family.display_name}`}>
          {members.map((member) => (
            <li
              className="flex items-center justify-between gap-3 rounded border p-2"
              key={member.id}
            >
              <span>
                {member.first_name} {member.last_name}
              </span>
              <span className="text-sm text-muted-foreground">
                {memberTypeLabels[member.member_type]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
