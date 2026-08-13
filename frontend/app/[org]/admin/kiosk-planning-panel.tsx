"use client";

import { CheckCircle2, CircleOff, Info, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ExternalPlanComparisonWorkspace } from "@/app/[org]/admin/external-plan-comparison";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  loadPlanningProposals,
  confirmPlanningProposal,
  refreshPlanningProposals,
  updatePlanningProposal,
  type ProposalWindow,
} from "@/lib/proposals";

function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function dateHeading(value: string) {
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function inputDateTime(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function KioskWindowCard({
  org,
  timezone,
  window,
  onUpdated,
}: Readonly<{
  org: string;
  timezone: string;
  window: ProposalWindow;
  onUpdated: (window: ProposalWindow) => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [startsAt, setStartsAt] = useState(inputDateTime(window.start_at));
  const [endsAt, setEndsAt] = useState(inputDateTime(window.end_at));
  const [kioskOpen, setKioskOpen] = useState(window.kiosk_open);
  const [shiftCount, setShiftCount] = useState(window.proposed_kiosk_slots ?? 1);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(window.kiosk_confirmed === true);
  const [error, setError] = useState<string | null>(null);

  // Keep the card in sync with the server-confirmed proposal state (e.g. after
  // "Vorschläge aus Spielbetrieb aktualisieren" or a confirmation elsewhere) —
  // this component is keyed by window.id and does not remount on refresh.
  useEffect(() => {
    setStartsAt(inputDateTime(window.start_at));
    setEndsAt(inputDateTime(window.end_at));
    setKioskOpen(window.kiosk_open);
    setShiftCount(window.proposed_kiosk_slots ?? 1);
    setConfirmed(window.kiosk_confirmed === true);
  }, [window]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePlanningProposal(org, window.id, {
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        kiosk_open: kioskOpen,
        proposed_kiosk_slots: shiftCount,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (caught) {
      setError(errorText(caught, "Die manuelle Anpassung konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    if (
      !window.kiosk_open ||
      !globalThis.window.confirm("Diesen Kiosk-Vorschlag als Entwurf im Kioskplan anlegen?")
    )
      return;
    setConfirming(true);
    setError(null);
    try {
      const updated = await confirmPlanningProposal(org, window.id, { kind: "kiosk" });
      setConfirmed(true);
      onUpdated(updated);
    } catch (caught) {
      setError(errorText(caught, "Der Kiosk-Vorschlag konnte nicht bestätigt werden."));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card>
      <CardBody className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Kiosk-Zeitfenster</p>
          <p className="mt-1 text-lg font-semibold">
            <time dateTime={window.start_at}>{dateTime(window.start_at, timezone)}</time>
            <span aria-hidden="true"> – </span>
            <span className="sr-only"> bis </span>
            <time dateTime={window.end_at}>{dateTime(window.end_at, timezone)}</time>
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold">
            {window.kiosk_open ? (
              <CheckCircle2 aria-hidden="true" className="size-5 text-status-success" />
            ) : (
              <CircleOff aria-hidden="true" className="size-5 text-muted-foreground" />
            )}
            {window.kiosk_open ? "Kiosk vorgeschlagen" : "Kiosk nicht vorgesehen"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {window.override_state === "MANUAL"
              ? "Manuell angepasst – noch nicht bestätigt"
              : "Entwurf aus dem Spielbetrieb – bitte bestätigen"}
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Abgedeckte Spiele</h3>
          <ul className="mt-2 grid gap-2" aria-label="Abgedeckte Spiele">
            {window.games.map((game) => (
              <li
                key={`${game.title}-${game.kickoff_at}`}
                className="rounded-sm bg-muted p-3 text-sm"
              >
                <span className="font-medium">{game.title}</span>
                <span className="block text-muted-foreground">
                  {dateTime(game.kickoff_at, timezone)} · {game.venue}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Spielorte: {window.venues.join(", ")}
          </p>
          {window.split_reason ? (
            <p className="mt-2 flex gap-2 text-sm text-muted-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>Geteiltes Zeitfenster: {window.split_reason}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Durchgehende Abdeckung</p>
          )}
        </div>

        <div className="lg:border-l lg:pl-5">
          {!editing ? (
            <Button className="w-full" variant="secondary" onClick={() => setEditing(true)}>
              Manuell anpassen
            </Button>
          ) : (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                Beginn
                <input
                  className="min-h-11 rounded-sm border bg-background px-3"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Ende
                <input
                  className="min-h-11 rounded-sm border bg-background px-3"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input
                  className="size-5"
                  type="checkbox"
                  checked={kioskOpen}
                  onChange={(event) => setKioskOpen(event.target.checked)}
                />
                Kiosk-Betrieb vorsehen
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Kiosk-Schichten
                <input
                  className="min-h-11 rounded-sm border bg-background px-3"
                  type="number"
                  min={1}
                  max={20}
                  value={shiftCount}
                  onChange={(event) => setShiftCount(Math.max(1, Number(event.target.value)))}
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-status-error">
                  {error}
                </p>
              ) : null}
              <Button disabled={saving || !startsAt || !endsAt} onClick={save}>
                {saving ? "Wird gespeichert …" : "Anpassung speichern"}
              </Button>
              <Button disabled={saving} variant="ghost" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            </div>
          )}
          {!editing && !confirmed ? (
            <Button
              className="mt-3 w-full"
              disabled={confirming || !window.kiosk_open}
              onClick={confirm}
            >
              {confirming ? "Wird angelegt …" : "Kiosk-Vorschlag bestätigen"}
            </Button>
          ) : null}
          {confirmed ? (
            <p className="mt-3 text-sm text-status-success" role="status">
              Kiosk-Entwurf angelegt
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function KioskPlanningPanel({ org, timezone }: Readonly<{ org: string; timezone: string }>) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [windows, setWindows] = useState<ProposalWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWindows((await loadPlanningProposals(org, tab === "past")).windows);
    } catch (caught) {
      setError(errorText(caught, "Die Kiosk-Vorschläge konnten nicht geladen werden."));
    } finally {
      setLoading(false);
    }
  }, [org, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setSuccess(null);
    try {
      const refreshed = await refreshPlanningProposals(org, tab === "past");
      setWindows(refreshed.windows);
      setSuccess("Vorschläge aus dem Spielbetrieb wurden aktualisiert.");
    } catch (caught) {
      setError(errorText(caught, "Die Kiosk-Vorschläge konnten nicht aktualisiert werden."));
    } finally {
      setRefreshing(false);
    }
  }

  // The "past" tab requests include_past=true (past AND upcoming), so it
  // additionally filters down to past-only here; "upcoming" already gets a
  // past-free list from the backend.
  const todayStr = new Date().toISOString().slice(0, 10);
  const visibleWindows = windows.filter((window) =>
    tab === "past" ? window.date < todayStr : true,
  );
  const days = visibleWindows.reduce<Map<string, ProposalWindow[]>>((grouped, window) => {
    const current = grouped.get(window.date) ?? [];
    grouped.set(window.date, [...current, window]);
    return grouped;
  }, new Map());

  return (
    <section className="grid gap-6" aria-labelledby="kiosk-title">
      <PageHeader
        headingId="kiosk-title"
        title="Kiosk"
        description="Aus Heimspielen abgeleitete Zeitfenster. Vorschläge bleiben von bestätigten Einsätzen getrennt."
        action={
          <Button disabled={loading || refreshing} onClick={refresh}>
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Wird aktualisiert …" : "Vorschläge aus Spielbetrieb aktualisieren"}
          </Button>
        }
      />

      <div className="flex gap-2 border-b" role="tablist" aria-label="Zeitraum">
        <Button
          role="tab"
          aria-selected={tab === "upcoming"}
          variant={tab === "upcoming" ? "primary" : "ghost"}
          onClick={() => setTab("upcoming")}
        >
          Aktuell
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "past"}
          variant={tab === "past" ? "primary" : "ghost"}
          onClick={() => setTab("past")}
        >
          Vergangene
        </Button>
      </div>

      <ExternalPlanComparisonWorkspace org={org} timezone={timezone} />

      {success ? (
        <p role="status" className="rounded-sm border border-status-success p-3">
          {success}
        </p>
      ) : null}
      {error ? (
        <Card>
          <CardBody>
            <p role="alert" className="text-status-error">
              {error}
            </p>
            <Button className="mt-4" variant="secondary" onClick={load}>
              Erneut laden
            </Button>
          </CardBody>
        </Card>
      ) : loading ? (
        <Card role="status" aria-live="polite">
          <CardBody>Kiosk-Vorschläge werden geladen …</CardBody>
        </Card>
      ) : visibleWindows.length === 0 ? (
        <Card role="status">
          <CardBody>
            <h2 className="text-lg font-semibold">
              {tab === "past" ? "Keine vergangenen Kiosk-Zeitfenster" : "Keine Kiosk-Zeitfenster"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {tab === "past"
                ? "Für vergangene Spiele an konfigurierten Heimspielorten gibt es keine Vorschläge."
                : "Für die konfigurierten Heimspielorte wurden keine Spiele gefunden. Es werden keine Einsätze erfunden."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-8">
          {[...days.entries()].map(([date, dayWindows]) => (
            <section key={date} className="grid gap-3" aria-labelledby={`kiosk-day-${date}`}>
              <h2 id={`kiosk-day-${date}`} className="text-xl font-semibold capitalize">
                {dateHeading(date)}
              </h2>
              <div className="grid gap-4">
                {dayWindows.map((window) => (
                  <KioskWindowCard
                    key={window.id}
                    org={org}
                    timezone={timezone}
                    window={window}
                    onUpdated={(updated) =>
                      setWindows((current) =>
                        current.map((item) => (item.id === updated.id ? updated : item)),
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
