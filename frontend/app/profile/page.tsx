"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { AuthCard } from "@/components/auth-card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLastOrganizationSlug, rememberLastOrganizationSlug } from "@/lib/organization";
import { SignupCancelControl } from "@/components/signup-cancel-control";
import {
  createChild,
  deleteChild,
  fetchVolunteerProfile,
  updateChild,
  updateSignupCompensation,
  updateVolunteerProfile,
  type CompensationType,
  type FamilyChild,
  type VolunteerProfile,
  type VolunteerSignupSummary,
} from "@/lib/volunteer-profile";

function formatShiftRange(startsAt: string, endsAt: string, timezone: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateFormatter = new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timezone,
  });
  const timeFormatter = new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  return `${dateFormatter.format(start)}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

function statusBadge(entry: VolunteerSignupSummary): {
  label: string;
  variant: BadgeProps["variant"];
} {
  if (entry.signup_status === "CANCELLED_BY_VOLUNTEER")
    return { label: "Abgemeldet", variant: "neutral" };
  if (entry.signup_status === "CANCELLED_BY_ADMIN")
    return { label: "Von Admin storniert", variant: "neutral" };
  switch (entry.outcome) {
    case "ATTENDED":
      return { label: "Erschienen", variant: "success" };
    case "EXCUSED_CANCELLED":
      return { label: "Entschuldigt abgesagt", variant: "neutral" };
    case "LATE_CANCELLED":
      return { label: "Kurzfristig abgesagt", variant: "warning" };
    case "NO_SHOW":
      return { label: "Unentschuldigt nicht erschienen", variant: "error" };
    case "SUBSTITUTE_ORGANIZED":
      return { label: "Ersatz organisiert", variant: "success" };
    default:
      return { label: "Angemeldet", variant: "neutral" };
  }
}

export default function ProfilePage() {
  const auth = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const loaded = await fetchVolunteerProfile();
      setProfile(loaded);
      rememberLastOrganizationSlug(loaded.organization.slug);
      return loaded;
    } catch {
      setMessage("Profil konnte nicht geladen werden.");
      return null;
    }
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) void reload();
  }, [auth.isAuthenticated, reload]);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  if (auth.isLoading) return <main className="p-6">Profil wird geladen …</main>;
  if (!auth.isAuthenticated) {
    // /profile carries no organization slug of its own, and /login is the
    // staff/admin sign-in page -- wrong destination for a volunteer entirely.
    // Route back to whichever club's page this browser last visited (its own
    // login modal opens via ?login=1, the same mechanism the register page's
    // "already registered" link uses) instead of a generic platform page.
    const lastOrganizationSlug = getLastOrganizationSlug();
    const loginHref = lastOrganizationSlug
      ? `/${encodeURIComponent(lastOrganizationSlug)}?login=1`
      : "/";
    return (
      <AuthCard title="Anmeldung erforderlich" back={{ label: "Zurück", onClick: goBack }}>
        <p>Bitte melde dich an, um dein Helferprofil zu bearbeiten.</p>
        <Link className="mt-3 inline-block underline" href={loginHref}>
          Anmelden
        </Link>
      </AuthCard>
    );
  }
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

  async function handleSignupUpdate(
    signupId: string,
    payload: {
      compensation_type: CompensationType | null;
      credited_family_member_id: string | null;
    },
  ) {
    try {
      const updated = await updateSignupCompensation(signupId, payload);
      setProfile(updated);
    } catch {
      setMessage("Die Änderung konnte nicht gespeichert werden.");
    }
  }

  return (
    <AuthCard
      organization={profile.organization}
      title="Mein Helferprofil"
      back={{ label: "Zurück", onClick: goBack }}
    >
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
          Standard-Einsatzvergütung
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
          <span className="text-sm font-normal text-muted-foreground">
            Gilt automatisch für neue Einsätze; pro Einsatz unten anpassbar.
          </span>
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
        {message ? <p role="status">{message}</p> : null}
        <button className="min-h-11 rounded bg-primary px-4 text-primary-foreground">
          Speichern
        </button>
      </form>
      <ChildrenSection
        familyChildren={profile.family_children}
        onChanged={reload}
        onError={(text) => setMessage(text)}
      />
      <SignupList
        title="Kommende Einsätze"
        entries={profile.upcoming_signups}
        familyChildren={profile.family_children}
        organization={profile.organization}
        onUpdate={handleSignupUpdate}
        onCancelled={setProfile}
      />
      <SignupList
        title="Geleistete Einsätze"
        entries={profile.completed_signups}
        familyChildren={profile.family_children}
        organization={profile.organization}
        onUpdate={handleSignupUpdate}
        onCancelled={setProfile}
      />
    </AuthCard>
  );
}

function ChildrenSection({
  familyChildren,
  onChanged,
  onError,
}: Readonly<{
  familyChildren: FamilyChild[];
  onChanged: () => Promise<VolunteerProfile | null>;
  onError: (message: string) => void;
}>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleRemove(child: FamilyChild) {
    if (!window.confirm(`"${child.name}" wirklich entfernen?`)) return;
    setBusy(true);
    try {
      await deleteChild(child.id);
      await onChanged();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Das Kind konnte nicht entfernt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSubmit(childId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await updateChild(childId, {
        first_name: String(data.get("first_name") ?? "").trim(),
        last_name: String(data.get("last_name") ?? "").trim(),
        team_name: String(data.get("team_name") ?? "").trim() || null,
      });
      setEditingId(null);
      await onChanged();
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Das Kind konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createChild({
        first_name: String(data.get("first_name") ?? "").trim(),
        last_name: String(data.get("last_name") ?? "").trim(),
        team_name: String(data.get("team_name") ?? "").trim() || null,
      });
      form.reset();
      setShowAddForm(false);
      await onChanged();
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Das Kind konnte nicht hinzugefügt werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded border p-3" aria-label="Kinder verwalten">
      <h2 className="font-medium">Kinder verwalten</h2>
      {familyChildren.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Noch keine Kinder erfasst.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {familyChildren.map((child) =>
            editingId === child.id ? (
              <li key={child.id} className="rounded bg-muted/40 p-2">
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => void handleEditSubmit(child.id, event)}
                >
                  <input
                    className="min-h-11 rounded border px-3"
                    name="first_name"
                    placeholder="Vorname"
                    defaultValue={child.name.split(" ")[0] ?? ""}
                    required
                    disabled={busy}
                  />
                  <input
                    className="min-h-11 rounded border px-3"
                    name="last_name"
                    placeholder="Nachname"
                    defaultValue={child.name.split(" ").slice(1).join(" ")}
                    required
                    disabled={busy}
                  />
                  <input
                    className="min-h-11 rounded border px-3"
                    name="team_name"
                    placeholder="Mannschaft (optional)"
                    disabled={busy}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={busy}>
                      Speichern
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </form>
              </li>
            ) : (
              <li
                key={child.id}
                className="flex items-center justify-between gap-2 rounded bg-muted/40 p-2"
              >
                <span>{child.name}</span>
                <span className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setEditingId(child.id)}
                  >
                    Bearbeiten
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void handleRemove(child)}
                  >
                    Entfernen
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      {showAddForm ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(event) => void handleAddSubmit(event)}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Vorname
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name="first_name"
              required
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nachname
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name="last_name"
              required
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mannschaft (optional)
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name="team_name"
              disabled={busy}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Wird gespeichert …" : "Speichern"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setShowAddForm(false)}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => setShowAddForm(true)}
        >
          Kind hinzufügen
        </Button>
      )}
    </section>
  );
}

function SignupList({
  title,
  entries,
  familyChildren,
  organization,
  onUpdate,
  onCancelled,
}: Readonly<{
  title: string;
  entries: VolunteerSignupSummary[];
  familyChildren: FamilyChild[];
  organization: VolunteerProfile["organization"];
  onUpdate: (
    signupId: string,
    payload: {
      compensation_type: CompensationType | null;
      credited_family_member_id: string | null;
    },
  ) => Promise<void>;
  onCancelled: (profile: VolunteerProfile) => void;
}>) {
  const timezone = organization.timezone;
  return (
    <section className="mt-6 rounded border p-3" aria-label={title}>
      <h2 className="font-medium">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Keine Einträge.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {entries.map((entry) => {
            const badge = statusBadge(entry);
            const shiftLabel = formatShiftRange(entry.shift_starts_at, entry.shift_ends_at, timezone);
            const stillOpen = entry.signup_status === "ACTIVE" && entry.outcome === "OPEN";
            return (
              <li key={entry.id} className="rounded bg-muted/40 p-2">
                <p className="font-medium">{entry.event_title}</p>
                <p>{shiftLabel}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {stillOpen ? (
                    <SignupCancelControl
                      entry={entry}
                      shiftLabel={shiftLabel}
                      organization={organization}
                      onCancelled={onCancelled}
                    />
                  ) : null}
                </div>
                <label className="mt-2 flex flex-col gap-1">
                  Einsatzvergütung
                  <select
                    className="min-h-11 rounded border px-3"
                    value={entry.compensation_type}
                    onChange={(event) =>
                      void onUpdate(entry.id, {
                        compensation_type: event.target.value as CompensationType,
                        credited_family_member_id: entry.credited_family_member_id,
                      })
                    }
                  >
                    <option value="WORK_HOURS">Sollstunden</option>
                    <option value="VOLUNTARY">Unentgeltlich</option>
                    <option value="PAYOUT">Bezahlt</option>
                  </select>
                </label>
                <label className="mt-2 flex flex-col gap-1">
                  Zugeordnetes Kind
                  <select
                    className="min-h-11 rounded border px-3"
                    value={entry.credited_family_member_id ?? ""}
                    onChange={(event) =>
                      void onUpdate(entry.id, {
                        compensation_type: entry.compensation_type,
                        credited_family_member_id: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Keine Zuordnung</option>
                    {familyChildren.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
