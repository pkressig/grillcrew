"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  createClubYear,
  createSeason,
  deleteClubYear,
  deleteSeason,
  loadPlanning,
  updateClubYear,
  updateSeason,
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
const variants: Record<PlanningStatus, BadgeProps["variant"]> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  CLOSED: "warning",
  ARCHIVED: "neutral",
};
const seasonActions: Record<PlanningStatus, PlanningStatus[]> = {
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

function dateRange(start: string, end: string) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("de-CH").format(new Date(`${value}T00:00:00`));
  return `${format(start)} – ${format(end)}`;
}

export function PeriodManagementPanel({ org }: Readonly<{ org: string }>) {
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
          : "Die Planungsperioden konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  async function run(operation: () => Promise<unknown>, message: string) {
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
    if (
      await run(
        () =>
          createClubYear(org, {
            label: String(data.get("label")),
            start_date: String(data.get("start_date")),
            end_date: String(data.get("end_date")),
            status: "DRAFT",
          }),
        "Vereinsjahr wurde erstellt.",
      )
    )
      form.reset();
  }
  async function submitSeason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (
      await run(
        () =>
          createSeason(org, String(data.get("club_year_id")), {
            type: data.get("type") as SeasonType,
            name: String(data.get("name")),
            start_date: String(data.get("start_date")),
            end_date: String(data.get("end_date")),
            status: "DRAFT",
          }),
        "Saison wurde erstellt.",
      )
    )
      form.reset();
  }
  function changeSeasonStatus(season: Season, next: PlanningStatus) {
    const confirmation =
      next === "CLOSED"
        ? `Saison "${season.name}" wirklich schliessen? Danach sind nur noch eingeschränkte Änderungen möglich.`
        : next === "ARCHIVED"
          ? `Saison "${season.name}" wirklich archivieren? Archivierte Saisons können nicht mehr bearbeitet werden.`
          : null;
    if (confirmation && !window.confirm(confirmation)) return;
    void run(() => updateSeasonStatus(org, season.id, next), "Saisonstatus wurde aktualisiert.");
  }
  function editYear(year: ClubYear) {
    const label = window.prompt("Label des Vereinsjahrs", year.label);
    if (label === null) return;
    const start = window.prompt("Startdatum (JJJJ-MM-TT)", year.start_date);
    if (start === null) return;
    const end = window.prompt("Enddatum (JJJJ-MM-TT)", year.end_date);
    if (end === null) return;
    void run(
      () => updateClubYear(org, year.id, { label, start_date: start, end_date: end }),
      "Vereinsjahr wurde aktualisiert.",
    );
  }
  function editSeason(season: Season) {
    const name = window.prompt("Name der Saison", season.name);
    if (name === null) return;
    const start = window.prompt("Startdatum (JJJJ-MM-TT)", season.start_date);
    if (start === null) return;
    const end = window.prompt("Enddatum (JJJJ-MM-TT)", season.end_date);
    if (end === null) return;
    void run(
      () => updateSeason(org, season.id, { name, start_date: start, end_date: end }),
      "Saison wurde aktualisiert.",
    );
  }
  function removeYear(year: ClubYear) {
    if (
      window.confirm(
        `Vereinsjahr "${year.label}" endgültig löschen? Dies ist nur bei einem unbenutzten Entwurf möglich.`,
      )
    )
      void run(() => deleteClubYear(org, year.id), "Vereinsjahr wurde gelöscht.");
  }
  function removeSeason(season: Season) {
    if (
      window.confirm(
        `Saison "${season.name}" endgültig löschen? Dies ist nur bei einem unbenutzten Entwurf möglich.`,
      )
    )
      void run(() => deleteSeason(org, season.id), "Saison wurde gelöscht.");
  }

  return (
    <section className="grid gap-6" aria-labelledby="period-management-title">
      <PageHeader
        headingId="period-management-title"
        title="Vereinsjahr/Saisonverwaltung"
        description="Planungsperioden erstellen, bearbeiten und sicher durch ihren Lebenszyklus führen."
      />
      {loading ? <p role="status">Planungsperioden werden geladen …</p> : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive bg-destructive/5 p-4">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="rounded-md border border-primary bg-primary/5 p-4">
          {success}
        </p>
      ) : null}
      {!loading ? (
        <>
          <Card
            className="border-primary/20 bg-primary/5"
            role="region"
            aria-labelledby="current-season-title"
          >
            <CardBody>
              <h2 id="current-season-title" className="font-semibold">
                Aktuelle Saison
              </h2>
              <p className="mt-2 text-sm">
                {currentSeason ? (
                  <>
                    <strong>{currentSeason.name}</strong> · {typeLabels[currentSeason.type]} ·{" "}
                    {dateRange(currentSeason.start_date, currentSeason.end_date)}
                  </>
                ) : (
                  "Derzeit ist keine Saison aktiv."
                )}
              </p>
            </CardBody>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="grid content-start gap-3" aria-labelledby="club-years-title">
              <h2 id="club-years-title" className="text-xl font-semibold">
                Vereinsjahre
              </h2>
              {clubYears.length ? (
                <ul className="grid gap-3">
                  {clubYears.map((year) => (
                    <li key={year.id}>
                      <Card>
                        <CardBody>
                          <div className="flex justify-between gap-2">
                            <strong>{year.label}</strong>
                            <Badge variant={variants[year.status]}>
                              {statusLabels[year.status]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm">
                            {dateRange(year.start_date, year.end_date)} ·{" "}
                            {seasons.filter((item) => item.club_year_id === year.id).length} Saisons
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {year.status !== "ARCHIVED" ? (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                aria-label={`Vereinsjahr ${year.label} bearbeiten`}
                                onClick={() => editYear(year)}
                              >
                                Bearbeiten
                              </Button>
                            ) : null}
                            {year.status === "DRAFT" ? (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => updateClubYear(org, year.id, { status: "CLOSED" }),
                                    "Vereinsjahr wurde geschlossen.",
                                  )
                                }
                              >
                                Schliessen
                              </Button>
                            ) : null}
                            {year.status === "DRAFT" || year.status === "CLOSED" ? (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => updateClubYear(org, year.id, { status: "ARCHIVED" }),
                                    "Vereinsjahr wurde archiviert.",
                                  )
                                }
                              >
                                Archivieren
                              </Button>
                            ) : null}
                            {year.status === "DRAFT" ? (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                aria-label={`Vereinsjahr ${year.label} löschen`}
                                onClick={() => removeYear(year)}
                              >
                                Löschen
                              </Button>
                            ) : null}
                          </div>
                        </CardBody>
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Noch keine Vereinsjahre vorhanden.</p>
              )}
              <details className="rounded-lg border p-4">
                <summary className="min-h-11 cursor-pointer font-medium">
                  Vereinsjahr erstellen
                </summary>
                <form className="mt-3 grid gap-3" onSubmit={submitClubYear}>
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
                  <Button disabled={busy}>Vereinsjahr erstellen</Button>
                </form>
              </details>
            </section>
            <section className="grid content-start gap-3" aria-labelledby="seasons-title">
              <h2 id="seasons-title" className="text-xl font-semibold">
                Saisons
              </h2>
              {seasons.length ? (
                <ul className="grid gap-3">
                  {seasons.map((season) => (
                    <li key={season.id}>
                      <Card>
                        <CardBody>
                          <div className="flex justify-between gap-2">
                            <strong>{season.name}</strong>
                            <Badge variant={variants[season.status]}>
                              {statusLabels[season.status]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm">
                            {typeLabels[season.type]} ·{" "}
                            {dateRange(season.start_date, season.end_date)}
                            {currentSeason?.id === season.id ? " · Aktuelle Saison" : ""}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Vereinsjahr:{" "}
                            {clubYears.find((year) => year.id === season.club_year_id)?.label ??
                              "Nicht verfügbar"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {seasonActions[season.status].map((next) => (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                key={next}
                                aria-label={`Saison ${season.name} ${actionLabels[next]?.toLocaleLowerCase("de-CH")}`}
                                onClick={() => changeSeasonStatus(season, next)}
                              >
                                {actionLabels[next]}
                              </Button>
                            ))}
                            {season.status === "DRAFT" || season.status === "ACTIVE" ? (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                aria-label={`Saison ${season.name} bearbeiten`}
                                onClick={() => editSeason(season)}
                              >
                                Bearbeiten
                              </Button>
                            ) : null}
                            {season.status === "DRAFT" ? (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                aria-label={`Saison ${season.name} löschen`}
                                onClick={() => removeSeason(season)}
                              >
                                Löschen
                              </Button>
                            ) : null}
                          </div>
                        </CardBody>
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Noch keine Saisons vorhanden.</p>
              )}
              <details className="rounded-lg border p-4">
                <summary className="min-h-11 cursor-pointer font-medium">Saison erstellen</summary>
                <form className="mt-3 grid gap-3" onSubmit={submitSeason}>
                  <label>
                    Vereinsjahr
                    <select
                      className={control}
                      name="club_year_id"
                      required
                      disabled={!clubYears.length}
                    >
                      <option value="">Bitte wählen</option>
                      {clubYears.map((year) => (
                        <option
                          key={year.id}
                          value={year.id}
                          disabled={year.status === "CLOSED" || year.status === "ARCHIVED"}
                        >
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
                  <Button disabled={busy || !clubYears.length}>Saison erstellen</Button>
                </form>
              </details>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
