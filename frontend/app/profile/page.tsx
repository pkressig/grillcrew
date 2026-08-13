"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { AuthCard } from "@/components/auth-card";
import {
  fetchVolunteerProfile,
  updateVolunteerProfile,
  type VolunteerProfile,
} from "@/lib/volunteer-profile";

export default function ProfilePage() {
  const auth = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (auth.isAuthenticated)
      void fetchVolunteerProfile()
        .then(setProfile)
        .catch(() => setMessage("Profil konnte nicht geladen werden."));
  }, [auth.isAuthenticated]);
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }
  if (auth.isLoading) return <main className="p-6">Profil wird geladen …</main>;
  if (!auth.isAuthenticated)
    return (
      <AuthCard title="Anmeldung erforderlich" back={{ label: "Zurück", onClick: goBack }}>
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
        compensation_family_member_id:
          String(data.get("compensation_family_member_id") ?? "") || null,
      });
      setProfile(updated);
      setMessage("Profil gespeichert.");
    } catch {
      setMessage("Profil konnte nicht gespeichert werden.");
    }
  }
  return (
    <AuthCard title="Mein Helferprofil" back={{ label: "Zurück", onClick: goBack }}>
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
        <label className="flex flex-col gap-1 font-medium">
          Zugeordnetes Kind
          <select
            className="min-h-11 rounded border px-3"
            name="compensation_family_member_id"
            defaultValue={profile.compensation_family_member_id ?? ""}
          >
            <option value="">Keine Zuordnung</option>
            {profile.family_children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </label>
        <SignupList title="Kommende Einsätze" entries={profile.upcoming_signups} />
        <SignupList title="Geleistete Einsätze" entries={profile.completed_signups} />
        {message ? <p role="status">{message}</p> : null}
        <button className="min-h-11 rounded bg-primary px-4 text-primary-foreground">
          Speichern
        </button>
      </form>
    </AuthCard>
  );
}

function SignupList({
  title,
  entries,
}: Readonly<{ title: string; entries: VolunteerProfile["upcoming_signups"] }>) {
  return (
    <section className="rounded border p-3" aria-label={title}>
      <h2 className="font-medium">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Keine Einträge.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded bg-muted/40 p-2">
              <p className="font-medium">{entry.event_title}</p>
              <p>
                {entry.event_location} · {new Date(entry.shift_starts_at).toLocaleString("de-CH")}
              </p>
              <p className="text-muted-foreground">Status: {entry.outcome}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
