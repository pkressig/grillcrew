"use client";

import { CheckCircle2, Flame, Store, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  loadExternalPlanComparison,
  type ExternalPlanComparisonRow,
} from "@/lib/external-kiosk-plan";
import {
  confirmPlanningProposal,
  loadPlanningProposals,
  updatePlanningProposal,
  type PlanningProposalWindow,
} from "@/lib/proposals";

type EditableWindow = PlanningProposalWindow & {
  grill_required: boolean;
  proposed_grill_slots: number;
};

export function GrillPlanningPanel({ org, timezone }: Readonly<{ org: string; timezone: string }>) {
  const [windows, setWindows] = useState<PlanningProposalWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [comparisonRows, setComparisonRows] = useState<ExternalPlanComparisonRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadPlanningProposals(org);
      setWindows(result.windows);
      try {
        setComparisonRows((await loadExternalPlanComparison(org))?.rows ?? []);
      } catch {
        // Proposal editing remains available when the optional comparison cannot be loaded.
        setComparisonRows([]);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Die Grillvorschläge konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(window: EditableWindow) {
    setSavingId(window.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updatePlanningProposal(org, window.id, {
        grill_required: window.grill_required,
        proposed_grill_slots: window.grill_required ? window.proposed_grill_slots : 0,
      });
      setWindows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSuccess(`Grillvorschlag für ${formatDate(updated.date)} gespeichert.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Die Anpassung konnte nicht gespeichert werden.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function confirm(window: EditableWindow) {
    if (
      !window.grill_required ||
      !globalThis.window.confirm("Diesen Grill-Vorschlag als Entwurf im Grillplan anlegen?")
    )
      return;
    setSavingId(window.id);
    setError(null);
    try {
      const updated = await confirmPlanningProposal(org, window.id, {
        kind: "grill",
        grill_shift_count: window.proposed_grill_slots,
      });
      setWindows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSuccess(`Grillentwurf für ${formatDate(updated.date)} angelegt.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Der Grill-Vorschlag konnte nicht bestätigt werden.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const openWindows = windows.filter(
    (window) => window.kiosk_open && window.kiosk_confirmed !== false,
  );

  return (
    <section className="grid gap-6" aria-labelledby="grill-title">
      <PageHeader
        headingId="grill-title"
        title="Grill"
        description="Grillvorschläge innerhalb geöffneter Kioskfenster – noch keine bestätigten Einsätze."
      />

      {success ? (
        <p
          className="rounded-md border border-status-success/30 bg-status-success/10 p-4"
          role="status"
        >
          {success}
        </p>
      ) : null}
      {error ? (
        <Card role="alert">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => void load()}>
              Erneut versuchen
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {loading ? (
        <Card role="status" aria-live="polite">
          <CardBody>Grillvorschläge werden geladen …</CardBody>
        </Card>
      ) : !error && openWindows.length === 0 ? (
        <Card role="status">
          <CardBody>
            <h2 className="text-lg font-semibold">Keine offenen Kioskfenster</h2>
            <p className="mt-2 text-muted-foreground">
              Für die Spiele an Heimplätzen ist derzeit kein Kiosk geöffnet. Deshalb gibt es keine
              Grillvorschläge.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5">
          {openWindows.map((window) => (
            <GrillWindowCard
              key={window.id}
              window={window}
              timezone={timezone}
              saving={savingId === window.id}
              onSave={save}
              onConfirm={confirm}
              comparison={comparisonRows.find((row) => row.proposal_window?.id === window.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GrillWindowCard({
  window,
  timezone,
  saving,
  onSave,
  onConfirm,
  comparison,
}: Readonly<{
  window: PlanningProposalWindow;
  timezone: string;
  saving: boolean;
  onSave: (window: EditableWindow) => Promise<void>;
  onConfirm: (window: EditableWindow) => Promise<void>;
  comparison?: ExternalPlanComparisonRow;
}>) {
  const [grillRequired, setGrillRequired] = useState(window.grill_required);
  const [slots, setSlots] = useState(window.proposed_grill_slots);
  const [confirmed, setConfirmed] = useState(window.status === "CONFIRMED");
  const confirming = saving;
  const headingId = `grill-window-${window.id}`;

  useEffect(() => {
    setGrillRequired(window.grill_required);
    setSlots(window.proposed_grill_slots);
    setConfirmed(window.status === "CONFIRMED");
  }, [window]);

  return (
    <Card>
      <CardBody className="grid gap-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{formatDate(window.date)}</p>
            <h2 className="text-xl font-bold" id={headingId}>
              {formatTime(window.start_at, timezone)}–{formatTime(window.end_at, timezone)} Uhr
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">
              <Store aria-hidden="true" className="mr-1" size={15} />
              Kiosk offen
            </Badge>
            <Badge variant={window.override_state === "MANUAL" ? "warning" : "neutral"}>
              {window.override_state === "MANUAL" ? "Manuell angepasst" : "Vorschlag"}
            </Badge>
            <Badge
              variant={
                comparison?.review_state === "OVERRIDDEN"
                  ? "warning"
                  : comparison?.statuses.includes("MATCH")
                    ? "success"
                    : "neutral"
              }
            >
              {comparison?.review_state === "OVERRIDDEN"
                ? "Kioskdeckung manuell übersteuert"
                : comparison?.statuses.includes("MATCH")
                  ? "Kioskdeckung verifiziert"
                  : "Kioskdeckung fehlt"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.65fr)]">
          <div>
            <h3 className="font-semibold">Abgedeckte Spiele</h3>
            <ul className="mt-2 grid gap-2">
              {window.games.map((game) => (
                <li
                  className="rounded-md bg-muted p-3"
                  key={`${game.kickoff_at}-${game.title}-${game.venue}`}
                >
                  <span className="font-medium">
                    <time dateTime={game.kickoff_at}>{formatTime(game.kickoff_at, timezone)}</time>
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">: </span>
                    <span>{game.title}</span>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{game.venue}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border p-4">
            <div className="flex items-center gap-2 font-semibold">
              {grillRequired ? (
                <CheckCircle2 aria-hidden="true" className="text-status-success" size={20} />
              ) : (
                <XCircle aria-hidden="true" className="text-status-neutral" size={20} />
              )}
              <span>Grill {grillRequired ? "vorgeschlagen" : "nicht vorgesehen"}</span>
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <Flame aria-hidden="true" size={17} />
              {grillRequired
                ? `${slots} ${slots === 1 ? "Grillplatz" : "Grillplätze"} vorgeschlagen`
                : "Keine Grillplätze vorgeschlagen"}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {window.crew_rule_context
                ? `Crew-Regel: ${window.crew_rule_context}`
                : "Standardvorschlag: bis drei gleichzeitige Spiele ein Grillplatz, darüber zwei."}
            </p>
          </div>
        </div>
        {!confirmed ? (
          <Button
            className="justify-self-start"
            disabled={saving || !grillRequired}
            type="button"
            onClick={async () => {
              if (!globalThis.window.confirm("Diesen Grill-Vorschlag als Entwurf anlegen?")) return;
              setConfirmed(true);
              try {
                await onConfirm({
                  ...window,
                  grill_required: grillRequired,
                  proposed_grill_slots: slots,
                });
              } finally {
                // callback owns persistence state
              }
            }}
          >
            {confirming ? "Wird angelegt …" : "Grill-Vorschlag bestätigen"}
          </Button>
        ) : (
          <p className="text-sm text-status-success" role="status">
            Grill-Entwurf angelegt
          </p>
        )}

        <form
          aria-labelledby={headingId}
          className="grid items-end gap-4 border-t pt-5 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.6fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave({ ...window, grill_required: grillRequired, proposed_grill_slots: slots });
          }}
        >
          <label className="grid gap-1.5 font-medium">
            Grillstatus
            <select
              className="min-h-11 rounded-md border bg-background px-3"
              value={grillRequired ? "yes" : "no"}
              onChange={(event) => setGrillRequired(event.target.value === "yes")}
            >
              <option value="yes">Grill erforderlich</option>
              <option value="no">Grill nicht erforderlich</option>
            </select>
          </label>
          <label className="grid gap-1.5 font-medium">
            Grillplätze
            <input
              className="min-h-11 rounded-md border bg-background px-3 disabled:opacity-50"
              disabled={!grillRequired}
              min={1}
              max={12}
              type="number"
              value={slots}
              onChange={(event) => setSlots(Math.max(1, Number(event.target.value)))}
            />
          </label>
          <Button disabled={saving} type="submit">
            {saving ? "Speichert …" : "Anpassung speichern"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Dieser Grillvorschlag erzeugt weder bestätigte Schichten noch öffentliche Anmeldungen.
        </p>
      </CardBody>
    </Card>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(value));
}
