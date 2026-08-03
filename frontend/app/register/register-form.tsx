"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import type { PublicOrganization } from "@/lib/organization";
import { registerVolunteer } from "@/lib/volunteer-profile";

export function RegisterForm({ organization }: Readonly<{ organization: PublicOrganization }>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      await registerVolunteer({
        organization_slug: organization.slug,
        first_name: String(data.get("first_name") ?? ""),
        last_name: String(data.get("last_name") ?? ""),
        phone: String(data.get("phone") ?? ""),
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
        compensation_preference: String(data.get("compensation_type") ?? "") || undefined,
        child_first_name: String(data.get("child_first_name") ?? "") || undefined,
        child_last_name: String(data.get("child_last_name") ?? "") || undefined,
      });
      router.replace(`/login?org=${encodeURIComponent(organization.slug)}&registered=1`);
    } catch {
      setError("Die Registrierung konnte nicht abgeschlossen werden. Bitte prüfe deine Angaben.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <AuthCard organization={organization} title="Helferkonto erstellen">
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
            ["password", "Passwort", "password"],
          ] as const
        ).map(([name, label, type]) => (
          <label key={name} className="flex flex-col gap-1 font-medium">
            {label}
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name={name}
              type={type}
              required
              autoComplete={
                name === "password" ? "new-password" : name === "email" ? "email" : "name"
              }
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 font-medium">
          Einsatzvergütung (optional)
          <select className="min-h-11 rounded border px-3 font-normal" name="compensation_type">
            <option value="">Noch nicht festlegen</option>
            <option value="WORK_HOURS">Sollstunden</option>
            <option value="VOLUNTARY">Unentgeltlich</option>
            <option value="PAYOUT">Bezahlt</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Mitglied/Kind (optional)
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="child_first_name"
            placeholder="Vorname des Kindes"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Kind Nachname (optional)
          <input className="min-h-11 rounded border px-3 font-normal" name="child_last_name" />
        </label>
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
        <a
          className="text-center text-sm underline"
          href={`/login?org=${encodeURIComponent(organization.slug)}`}
        >
          Bereits registriert? Anmelden
        </a>
      </form>
    </AuthCard>
  );
}
