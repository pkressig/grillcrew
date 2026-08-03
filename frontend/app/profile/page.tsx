"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { AuthCard } from "@/components/auth-card";
import {
  fetchVolunteerProfile,
  updateVolunteerProfile,
  type VolunteerProfile,
} from "@/lib/volunteer-profile";

export default function ProfilePage() {
  const auth = useAuth();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (auth.isAuthenticated)
      void fetchVolunteerProfile()
        .then(setProfile)
        .catch(() => setMessage("Profil konnte nicht geladen werden."));
  }, [auth.isAuthenticated]);
  if (auth.isLoading) return <main className="p-6">Profil wird geladen …</main>;
  if (!auth.isAuthenticated)
    return (
      <AuthCard title="Anmeldung erforderlich">
        <p>Bitte melde dich an, um dein Helferprofil zu bearbeiten.</p>
        <Link className="mt-3 inline-block underline" href="/login">
          Anmelden
        </Link>
      </AuthCard>
    );
  if (!profile) return <main className="p-6">{message ?? "Profil wird geladen …"}</main>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const updated = await updateVolunteerProfile({
        first_name: String(data.get("first_name")),
        last_name: String(data.get("last_name")),
        phone: String(data.get("phone")),
        compensation_preference: String(
          data.get("compensation_preference"),
        ) as VolunteerProfile["compensation_preference"],
      });
      setProfile(updated);
      setMessage("Profil gespeichert.");
    } catch {
      setMessage("Profil konnte nicht gespeichert werden.");
    }
  }
  return (
    <AuthCard title="Mein Helferprofil">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {(
          [
            ["first_name", "Vorname"],
            ["last_name", "Nachname"],
            ["phone", "Telefon"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="flex flex-col gap-1 font-medium">
            {label}
            <input
              className="min-h-11 rounded border px-3"
              name={name}
              defaultValue={profile[name]}
              required
            />
          </label>
        ))}
        <p className="text-sm text-muted-foreground">E-Mail: {profile.email}</p>
        <label className="flex flex-col gap-1 font-medium">
          Einsatzvergütung
          <select
            className="min-h-11 rounded border px-3"
            name="compensation_preference"
            defaultValue={profile.compensation_preference}
          >
            <option value="">Noch nicht festlegen</option>
            <option value="WORK_HOURS">Sollstunden</option>
            <option value="VOLUNTARY">Unentgeltlich</option>
            <option value="PAYOUT">Bezahlt</option>
          </select>
        </label>
        {message ? <p role="status">{message}</p> : null}
        <button className="min-h-11 rounded bg-primary px-4 text-primary-foreground">
          Speichern
        </button>
      </form>
    </AuthCard>
  );
}
