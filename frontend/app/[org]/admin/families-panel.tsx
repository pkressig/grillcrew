"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFamily, loadFamilies, type Family } from "@/lib/families";

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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
