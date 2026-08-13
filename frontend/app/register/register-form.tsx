"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import type { PublicOrganization } from "@/lib/organization";
import { registerVolunteer } from "@/lib/volunteer-profile";

/**
 * Draft field values that are safe to persist across a close/reopen cycle.
 * The password is intentionally excluded: it must never be written to
 * sessionStorage.
 */
type DraftFields = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  compensation_type: string;
  child_first_name: string;
  child_last_name: string;
  child_team_name: string;
};

const emptyDraft: DraftFields = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  compensation_type: "",
  child_first_name: "",
  child_last_name: "",
  child_team_name: "",
};

const DRAFT_STORAGE_PREFIX = "grillcrew.register-draft.";

function draftStorageKey(organizationSlug: string) {
  return `${DRAFT_STORAGE_PREFIX}${organizationSlug}`;
}

function readDraft(organizationSlug: string): DraftFields {
  if (typeof window === "undefined") return emptyDraft;
  try {
    const raw = window.sessionStorage.getItem(draftStorageKey(organizationSlug));
    if (!raw) return emptyDraft;
    const parsed = JSON.parse(raw) as Partial<DraftFields>;
    return { ...emptyDraft, ...parsed };
  } catch {
    return emptyDraft;
  }
}

function writeDraft(organizationSlug: string, fields: DraftFields) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(draftStorageKey(organizationSlug), JSON.stringify(fields));
  } catch {
    // Ignore storage access errors (e.g. private browsing with storage disabled).
  }
}

function clearDraft(organizationSlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(draftStorageKey(organizationSlug));
  } catch {
    // Ignore storage access errors.
  }
}

export function RegisterForm({
  organization,
  onSuccess,
  onSwitchToLogin,
  variant = "page",
}: Readonly<{
  organization: PublicOrganization;
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
  /** "modal" renders compactly for use inside the account dialog. */
  variant?: "page" | "modal";
}>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<DraftFields>(() => readDraft(organization.slug));
  const [password, setPassword] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-read the draft if the form is ever mounted for a different organization.
  useEffect(() => {
    setFields(readDraft(organization.slug));
  }, [organization.slug]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      writeDraft(organization.slug, fields);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fields, organization.slug]);

  function updateField(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await registerVolunteer({
        organization_slug: organization.slug,
        first_name: fields.first_name,
        last_name: fields.last_name,
        phone: fields.phone,
        email: fields.email,
        password,
        compensation_preference: fields.compensation_type || undefined,
        child_first_name: fields.child_first_name || undefined,
        child_last_name: fields.child_last_name || undefined,
        child_team_name: fields.child_team_name || undefined,
      });
      clearDraft(organization.slug);
      if (onSuccess) {
        onSuccess();
      } else {
        router.replace(`/${encodeURIComponent(organization.slug)}`);
      }
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : "";
      const message =
        detail === "email already registered"
          ? "Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an."
          : detail === "password policy violation"
            ? "Das Passwort muss mindestens 10 Zeichen lang sein."
            : detail === "organization not found"
              ? "Die Organisation wurde nicht gefunden."
              : detail ||
                "Die Registrierung konnte nicht abgeschlossen werden. Bitte prüfe deine Angaben.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <AuthCard
      organization={organization}
      title="Helferkonto erstellen"
      embedded={variant === "modal"}
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <p className="text-sm text-muted-foreground">
          Mit deinem Konto werden alle Einsätze direkt dir zugeordnet.
        </p>
        {(
          [
            ["first_name", "Vorname", "text"],
            ["last_name", "Nachname", "text"],
            ["phone", "Telefon", "tel"],
            ["email", "E-Mail", "email"],
          ] as const
        ).map(([name, label, type]) => (
          <label key={name} className="flex flex-col gap-1 font-medium">
            {label}
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name={name}
              type={type}
              value={fields[name]}
              onChange={updateField}
              required
              autoComplete={name === "email" ? "email" : "name"}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 font-medium">
          Passwort
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Einsatzvergütung (optional)
          <select
            className="min-h-11 rounded border px-3 font-normal"
            name="compensation_type"
            value={fields.compensation_type}
            onChange={updateField}
          >
            <option value="">Noch nicht festlegen</option>
            <option value="WORK_HOURS">Sollstunden</option>
            <option value="VOLUNTARY">Unentgeltlich</option>
            <option value="PAYOUT">Bezahlt</option>
          </select>
        </label>
        <div className="flex flex-col gap-3 rounded-lg border bg-background p-3">
          <div>
            <p className="font-semibold">Mitglied/Kind (optional)</p>
            <p className="text-sm text-muted-foreground">
              Falls die Einsätze einem Kind oder Familienmitglied gutgeschrieben werden sollen.
            </p>
          </div>
          <label className="flex flex-col gap-1 font-medium">
            Vorname des Kindes
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name="child_first_name"
              value={fields.child_first_name}
              onChange={updateField}
            />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Nachname des Kindes
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name="child_last_name"
              value={fields.child_last_name}
              onChange={updateField}
            />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Mannschaft des Kindes
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name="child_team_name"
              value={fields.child_team_name}
              onChange={updateField}
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-status-error">
            {error}
          </p>
        ) : null}
        <button
          className="min-h-11 rounded bg-primary px-4 font-medium text-primary-foreground"
          disabled={saving}
        >
          {saving ? "Konto wird erstellt …" : "Registrieren"}
        </button>
        {onSwitchToLogin ? (
          <button
            type="button"
            className="min-h-11 text-center text-sm underline"
            onClick={onSwitchToLogin}
          >
            Bereits registriert? Anmelden
          </button>
        ) : (
          <a
            className="text-center text-sm underline"
            href={`/login?org=${encodeURIComponent(organization.slug)}`}
          >
            Bereits registriert? Anmelden
          </a>
        )}
      </form>
    </AuthCard>
  );
}
