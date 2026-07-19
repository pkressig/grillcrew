"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createClubYear,
  createSeason,
  loadPlanning,
  updateSeasonStatus,
  type ClubYear,
  type PlanningStatus,
  type Season,
  type SeasonType,
} from "@/lib/planning";

const statusLabels: Record<PlanningStatus, string> = {
  DRAFT: "Entwurf",
  ACTIVE: "Aktiv",
  CLOSED: "Geschlossen",
  ARCHIVED: "Archiviert",
};
const typeLabels: Record<SeasonType, string> = {
  AUTUMN: "Herbst",
  SPRING: "Frühling",
  OTHER: "Andere",
};
const actions: Record<PlanningStatus, PlanningStatus[]> = {
  DRAFT: ["ACTIVE", "CLOSED", "ARCHIVED"],
  ACTIVE: ["CLOSED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};
const actionLabels: Partial<Record<PlanningStatus, string>> = {
  ACTIVE: "Aktivieren",
  CLOSED: "Schliessen",
  ARCHIVED: "Archivieren",
};
const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-md border px-4 font-medium disabled:opacity-50";

function dateRange(start: string, end: string) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("de-CH").format(new Date(`${value}T00:00:00`));
  return `${format(start)} – ${format(end)}`;
}

export function PlanningPanel({ org }: Readonly<{ org: string }>) {
  const [clubYears, setClubYears] = useState<ClubYear[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await loadPlanning(org);
      setClubYears(data.clubYears);
      setSeasons(data.seasons);
      setCurrentSeason(data.currentSeason);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Planungsdaten konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => void refresh(), [refresh]);

  async function run(operation: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      setSuccess(message);
      await refresh();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Änderung konnte nicht gespeichert werden.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitClubYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await run(
      () =>
        createClubYear(org, {
          label: String(data.get("label")),
          start_date: String(data.get("start_date")),
          end_date: String(data.get("end_date")),
          status: "DRAFT",
        }),
      "Vereinsjahr wurde erstellt.",
    );
    if (created) form.reset();
  }

  async function submitSeason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await run(
      () =>
        createSeason(org, String(data.get("club_year_id")), {
          type: data.get("type") as SeasonType,
          name: String(data.get("name")),
          start_date: String(data.get("start_date")),
          end_date: String(data.get("end_date")),
          status: "DRAFT",
        }),
      "Saison wurde erstellt.",
    );
    if (created) form.reset();
  }

  function updateStatus(season: Season, next: PlanningStatus) {
    const confirmation =
      next === "CLOSED"
        ? `Saison "${season.name}" wirklich schliessen? Danach sind nur noch eingeschränkte Änderungen möglich.`
        : next === "ARCHIVED"
          ? `Saison "${season.name}" wirklich archivieren? Archivierte Saisons können nicht mehr bearbeitet werden.`
          : null;

    if (confirmation && !window.confirm(confirmation)) return;

    void run(() => updateSeasonStatus(org, season.id, next), "Saisonstatus wurde aktualisiert.");
  }

  if (loading)
    return (
      <section aria-live="polite">
        <p>Planung wird geladen …</p>
      </section>
    );
  return (
    <section className="grid gap-6" aria-labelledby="planning-title">
      <div>
        <h2 id="planning-title" className="text-xl font-semibold">
          Planung
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Vereinsjahre und Saisons verwalten.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-status-error p-3 text-status-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="rounded-md border border-status-success p-3 text-status-success"
        >
          {success}
        </p>
      ) : null}
      <section className="rounded-lg border p-4">
        <h3 className="font-semibold">Aktuelle Saison</h3>
        {currentSeason ? (
          <p className="mt-2">
            <strong>{currentSeason.name}</strong> · {typeLabels[currentSeason.type]} ·{" "}
            {dateRange(currentSeason.start_date, currentSeason.end_date)}
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">Derzeit ist keine Saison aktiv.</p>
        )}
      </section>
      <section className="grid gap-4">
        <h3 className="text-lg font-semibold">Vereinsjahre</h3>
        {clubYears.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Vereinsjahre vorhanden.</p>
        ) : (
          <ul className="grid gap-3">
            {clubYears.map((year) => (
              <li key={year.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{year.label}</strong>
                  <span>{statusLabels[year.status]}</span>
                </div>
                <p className="mt-1 text-sm">
                  {dateRange(year.start_date, year.end_date)} ·{" "}
                  {seasons.filter((season) => season.club_year_id === year.id).length} Saisons
                </p>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" onSubmit={submitClubYear}>
          <h4 className="font-semibold sm:col-span-2">Vereinsjahr erstellen</h4>
          <label>
            Label
            <input className={control} name="label" placeholder="2026/27" required />
          </label>
          <label>
            Startdatum
            <input className={control} name="start_date" type="date" required />
          </label>
          <label>
            Enddatum
            <input className={control} name="end_date" type="date" required />
          </label>
          <button className={`${button} sm:self-end`} disabled={busy} type="submit">
            Vereinsjahr erstellen
          </button>
        </form>
      </section>
      <section className="grid gap-4">
        <h3 className="text-lg font-semibold">Saisons</h3>
        {seasons.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Saisons vorhanden.</p>
        ) : (
          <ul className="grid gap-3">
            {seasons.map((season) => (
              <li key={season.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{season.name}</strong>
                  <span>{statusLabels[season.status]}</span>
                </div>
                <p className="mt-1 text-sm">
                  {typeLabels[season.type]} · {dateRange(season.start_date, season.end_date)}
                  {currentSeason?.id === season.id ? " · Aktuelle Saison" : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vereinsjahr:{" "}
                  {clubYears.find((year) => year.id === season.club_year_id)?.label ??
                    "Nicht verfügbar"}
                </p>
                {actions[season.status].length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {actions[season.status].map((next) => (
                      <button
                        className={button}
                        disabled={busy}
                        key={next}
                        aria-label={`Saison ${season.name} ${actionLabels[next]?.toLocaleLowerCase("de-CH")}`}
                        onClick={() => updateStatus(season, next)}
                        type="button"
                      >
                        {actionLabels[next]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" onSubmit={submitSeason}>
          <h4 className="font-semibold sm:col-span-2">Saison erstellen</h4>
          <label>
            Vereinsjahr
            <select
              className={control}
              name="club_year_id"
              required
              disabled={clubYears.length === 0}
            >
              <option value="">Bitte wählen</option>
              {clubYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Typ
            <select className={control} name="type" defaultValue="AUTUMN">
              <option value="AUTUMN">Herbst</option>
              <option value="SPRING">Frühling</option>
              <option value="OTHER">Andere</option>
            </select>
          </label>
          <label>
            Name
            <input className={control} name="name" required />
          </label>
          <label>
            Startdatum
            <input className={control} name="start_date" type="date" required />
          </label>
          <label>
            Enddatum
            <input className={control} name="end_date" type="date" required />
          </label>
          <button
            className={`${button} sm:self-end`}
            disabled={busy || clubYears.length === 0}
            type="submit"
          >
            Saison erstellen
          </button>
        </form>
      </section>
    </section>
  );
}
