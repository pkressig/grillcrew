"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { useAuth } from "@/components/auth-provider";
import type { PublicOrganization } from "@/lib/organization";
import { cn } from "@/lib/utils";
import { registerVolunteer } from "@/lib/volunteer-profile";

type ChildDraft = { first_name: string; last_name: string; team_name: string };

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
  children: ChildDraft[];
};

const emptyChild: ChildDraft = { first_name: "", last_name: "", team_name: "" };

const emptyDraft: DraftFields = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  compensation_type: "",
  children: [emptyChild],
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
  pendingShiftId = null,
  area = "grill",
}: Readonly<{
  organization: PublicOrganization;
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
  /** "modal" renders compactly for use inside the account dialog. */
  variant?: "page" | "modal";
  /** A shift the visitor was trying to sign up for before being sent here to register. */
  pendingShiftId?: string | null;
  /**
   * Which shift-signup page to return to. Defaults to "grill" for
   * backward compatibility with old bookmarked/emailed register links that
   * predate the Grill/Kiosk split and carry no `area` param.
   */
  area?: "grill" | "kiosk";
}>) {
  const router = useRouter();
  const auth = useAuth();
  const minimumLength = organization.settings.volunteer_password_min_length;
  const backUrl = `/${encodeURIComponent(organization.slug)}/${area}`;
  const successUrl = pendingShiftId
    ? `${backUrl}?shift=${encodeURIComponent(pendingShiftId)}`
    : backUrl;
  const loginUrl = pendingShiftId
    ? `${backUrl}?shift=${encodeURIComponent(pendingShiftId)}&login=1`
    : `${backUrl}?login=1`;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<DraftFields>(() => readDraft(organization.slug));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Live feedback as the visitor types, rather than only on submit — only judge once the
  // confirmation field has content, so an empty field never flashes a mismatch.
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
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

  function updateChildField(index: number, field: keyof ChildDraft, value: string) {
    setFields((current) => ({
      ...current,
      children: current.children.map((child, i) =>
        i === index ? { ...child, [field]: value } : child,
      ),
    }));
  }

  function addChild() {
    setFields((current) => ({ ...current, children: [...current.children, { ...emptyChild }] }));
  }

  function removeChild(index: number) {
    setFields((current) => ({
      ...current,
      children: current.children.filter((_, i) => i !== index),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein. Bitte überprüfe deine Eingabe.");
      return;
    }
    setSaving(true);
    try {
      const children = fields.children
        .filter((child) => child.first_name.trim() && child.last_name.trim())
        .map((child) => ({
          first_name: child.first_name.trim(),
          last_name: child.last_name.trim(),
          team_name: child.team_name.trim() || undefined,
        }));
      await registerVolunteer({
        organization_slug: organization.slug,
        first_name: fields.first_name,
        last_name: fields.last_name,
        phone: fields.phone,
        email: fields.email,
        password,
        compensation_preference: fields.compensation_type || undefined,
        children,
      });
      clearDraft(organization.slug);
      await auth.refresh();
      if (onSuccess) {
        onSuccess();
      } else {
        router.replace(successUrl);
      }
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : "";
      const message =
        detail === "email already registered"
          ? "Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an."
          : detail === "password policy violation"
            ? `Das Passwort muss mindestens ${minimumLength} Zeichen lang sein.`
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
      back={
        variant === "page"
          ? { label: "Zurück zur Übersicht", onClick: () => router.replace(backUrl) }
          : undefined
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <p className="text-sm text-muted-foreground">
          Mit deinem Konto werden alle Einsätze direkt dir zugeordnet.
        </p>
        {(
          [
            ["first_name", "Vorname", "text", "given-name"],
            ["last_name", "Nachname", "text", "family-name"],
            ["phone", "Telefon", "tel", "tel"],
            ["email", "E-Mail", "email", "email"],
          ] as const
        ).map(([name, label, type, autoComplete]) => (
          <label key={name} className="flex flex-col gap-1 font-medium">
            {label}
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name={name}
              type={type}
              value={fields[name]}
              onChange={updateField}
              required
              autoComplete={autoComplete}
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
            minLength={minimumLength}
            autoComplete="new-password"
          />
        </label>
        <p className="text-sm text-muted-foreground">Mindestens {minimumLength} Zeichen.</p>
        <label className="flex flex-col gap-1 font-medium">
          Passwort bestätigen
          <input
            className={cn(
              "min-h-11 rounded border px-3 font-normal",
              passwordsMismatch && "border-status-error focus:border-status-error",
            )}
            name="password_confirmation"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={minimumLength}
            autoComplete="new-password"
            aria-invalid={passwordsMismatch}
          />
        </label>
        {passwordsMismatch ? (
          <p aria-live="polite" className="text-sm text-status-error">
            Die Passwörter stimmen nicht überein.
          </p>
        ) : passwordsMatch ? (
          <p aria-live="polite" className="text-sm text-status-success">
            Die Passwörter stimmen überein.
          </p>
        ) : null}
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
          {fields.children.map((child, index) => {
            const suffix = fields.children.length > 1 ? ` ${index + 1}` : "";
            return (
              <div
                key={index}
                className={cn("flex flex-col gap-3", index > 0 && "border-t border-border/70 pt-3")}
              >
                <label className="flex flex-col gap-1 font-medium">
                  {`Vorname des Kindes${suffix}`}
                  <input
                    className="min-h-11 rounded border px-3 font-normal"
                    value={child.first_name}
                    onChange={(event) => updateChildField(index, "first_name", event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-col gap-1 font-medium">
                  {`Nachname des Kindes${suffix}`}
                  <input
                    className="min-h-11 rounded border px-3 font-normal"
                    value={child.last_name}
                    onChange={(event) => updateChildField(index, "last_name", event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-col gap-1 font-medium">
                  {`Mannschaft des Kindes${suffix}`}
                  <input
                    className="min-h-11 rounded border px-3 font-normal"
                    value={child.team_name}
                    onChange={(event) => updateChildField(index, "team_name", event.target.value)}
                    autoComplete="off"
                  />
                </label>
                {fields.children.length > 1 ? (
                  <button
                    type="button"
                    className="min-h-11 self-start text-sm font-medium text-status-error underline"
                    onClick={() => removeChild(index)}
                  >
                    Kind entfernen
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="min-h-11 rounded border px-4 font-medium"
            onClick={addChild}
          >
            + Weiteres Kind hinzufügen
          </button>
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
          <a className="text-center text-sm underline" href={loginUrl}>
            Bereits registriert? Zur Anmeldung
          </a>
        )}
      </form>
    </AuthCard>
  );
}
