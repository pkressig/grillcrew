"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { loadAdminPlanningData } from "@/lib/admin-planning-data";
import { deleteClubYear, deleteSeason, type PlanningStatus } from "@/lib/planning";

const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
const historicalEventStatuses = new Set(["COMPLETED", "CANCELLED"]);
const statusLabels: Record<PlanningStatus, string> = {
  DRAFT: "Entwurf",
  ACTIVE: "Aktiv",
  CLOSED: "Geschlossen",
  ARCHIVED: "Archiviert",
};

export function PlanningArchivePanel({ org }: Readonly<{ org: string }>) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAdminPlanningData>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [season, setSeason] = useState("");
  const [venue, setVenue] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setData(await loadAdminPlanningData(org));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Das Archiv konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const archived = useMemo(() => {
    if (!data) return [];
    const seasonById = new Map(data.seasons.map((item) => [item.id, item]));
    const yearById = new Map(data.clubYears.map((item) => [item.id, item]));
    const query = search.trim().toLocaleLowerCase("de-CH");
    return data.eventGroups.filter(({ event }) => {
      const itemSeason = seasonById.get(event.season_id);
      const itemYear = itemSeason ? yearById.get(itemSeason.club_year_id) : undefined;
      const isHistorical =
        itemSeason?.status === "CLOSED" ||
        itemSeason?.status === "ARCHIVED" ||
        itemYear?.status === "CLOSED" ||
        itemYear?.status === "ARCHIVED" ||
        historicalEventStatuses.has(event.status);
      const haystack = [event.title, event.public_description, event.internal_note]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-CH");
      return (
        isHistorical &&
        (!query || haystack.includes(query)) &&
        (!year || itemYear?.id === year) &&
        (!season || itemSeason?.id === season) &&
        (!venue || event.location === venue) &&
        (!status || event.status === status) &&
        (!type || event.event_type === type)
      );
    });
  }, [data, search, year, season, venue, status, type]);

  async function removeArchived(kind: "year" | "season", id: string, label: string) {
    if (!window.confirm(`${label} endgültig löschen? Der Server prüft zuvor alle Abhängigkeiten.`))
      return;
    setBusy(true);
    setError(null);
    try {
      await (kind === "year" ? deleteClubYear(org, id) : deleteSeason(org, id));
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Datensatz konnte nicht gelöscht werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  const archivedYears = data?.clubYears.filter((item) => item.status === "ARCHIVED") ?? [];
  const archivedSeasons = data?.seasons.filter((item) => item.status === "ARCHIVED") ?? [];
  const historicalSeasons =
    data?.seasons.filter((item) => ["CLOSED", "ARCHIVED"].includes(item.status)) ?? [];
  const venues = [...new Set((data?.events ?? []).map((item) => item.location))].sort();
  const eventTypes = [...new Set((data?.events ?? []).map((item) => item.event_type))].sort();

  return (
    <section className="grid gap-6" aria-labelledby="archive-title">
      <PageHeader
        headingId="archive-title"
        title="Archiv"
        description="Historische Planungsdaten bewusst einsehen und sicher verwalten."
      />
      {loading ? <p role="status">Archiv wird geladen …</p> : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive p-4">
          {error}
        </p>
      ) : null}
      {!loading && data ? (
        <>
          <Card className="border-border/80 bg-muted/30">
            <CardBody>
              <h2 className="font-semibold">Schreibgeschützter Verlauf</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Archivierte und geschlossene Daten werden hier nur angezeigt. Der bestehende
                Lebenszyklus erlaubt keine Reaktivierung. Endgültiges Löschen wird nur für
                archivierte Perioden angeboten und serverseitig bei historischen Abhängigkeiten
                blockiert.
              </p>
            </CardBody>
          </Card>
          <section aria-labelledby="archive-periods-title" className="grid gap-3">
            <h2 id="archive-periods-title" className="text-xl font-semibold">
              Archivierte Perioden
            </h2>
            {archivedYears.length === 0 && archivedSeasons.length === 0 ? (
              <p className="text-muted-foreground">Keine archivierten Perioden vorhanden.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {archivedYears.map((item) => (
                  <li key={item.id}>
                    <Card>
                      <CardBody className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <strong>{item.label}</strong>
                          <p className="text-sm text-muted-foreground">
                            Vereinsjahr · {statusLabels[item.status]}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            void removeArchived("year", item.id, `Vereinsjahr „${item.label}“`)
                          }
                        >
                          Löschen
                        </Button>
                      </CardBody>
                    </Card>
                  </li>
                ))}
                {archivedSeasons.map((item) => (
                  <li key={item.id}>
                    <Card>
                      <CardBody className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <strong>{item.name}</strong>
                          <p className="text-sm text-muted-foreground">
                            Saison · {statusLabels[item.status]}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            void removeArchived("season", item.id, `Saison „${item.name}“`)
                          }
                        >
                          Löschen
                        </Button>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="archive-events-title" className="grid gap-4">
            <div>
              <h2 id="archive-events-title" className="text-xl font-semibold">
                Historische Spiele und Einsätze
              </h2>
              <p className="text-sm text-muted-foreground">{archived.length} Treffer</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label>
                Suche
                <input
                  className={control}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Teams, Titel oder Bemerkung"
                />
              </label>
              <label>
                Vereinsjahr
                <select
                  className={control}
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                >
                  <option value="">Alle</option>
                  {data.clubYears.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Saison
                <select
                  className={control}
                  value={season}
                  onChange={(event) => setSeason(event.target.value)}
                >
                  <option value="">Alle</option>
                  {historicalSeasons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ort
                <select
                  className={control}
                  value={venue}
                  onChange={(event) => setVenue(event.target.value)}
                >
                  <option value="">Alle</option>
                  {venues.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                SpielTyp
                <select
                  className={control}
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="">Alle</option>
                  {eventTypes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  className={control}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">Alle</option>
                  <option value="COMPLETED">Erledigt</option>
                  <option value="CANCELLED">Abgesagt</option>
                  <option value="CLOSED">Geschlossen</option>
                </select>
              </label>
            </div>
            {archived.length === 0 ? (
              <p className="rounded-md border p-4 text-muted-foreground">
                Keine historischen Einträge entsprechen den Filtern.
              </p>
            ) : (
              <ul className="grid gap-3">
                {archived.map(({ event, shifts }) => (
                  <li key={event.id}>
                    <Card>
                      <CardBody>
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <h3 className="font-semibold">{event.title}</h3>
                            <p className="text-sm">
                              {event.date}
                              {event.kickoff_time
                                ? ` · ${event.kickoff_time.slice(0, 5)}`
                                : ""} · {event.location}
                            </p>
                          </div>
                          <Badge variant="neutral">{event.status}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {event.event_type} · {shifts.length} Einsätze ·{" "}
                          {shifts.reduce((sum, item) => sum + item.required_volunteers, 0)} Plätze
                        </p>
                        {event.internal_note ? (
                          <p className="mt-2 text-sm">Bemerkung: {event.internal_note}</p>
                        ) : null}
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
