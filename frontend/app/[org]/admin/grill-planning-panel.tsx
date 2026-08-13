"use client";

import { CheckCircle2, Flame, Store, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { GameDayList } from "@/components/game-day-list";
import {
  loadExternalPlanComparison,
  type ExternalPlanComparisonRow,
} from "@/lib/external-kiosk-plan";
import {
  confirmPlanningProposal,
  deleteConfirmedWindow,
  loadPlanningProposals,
  refreshPlanningProposals,
  updateGrillShiftSplits,
  updatePlanningProposal,
  type PlanningProposalWindow,
  type ProposalGrillShiftSplitInput,
} from "@/lib/proposals";
import {
  cancelSignup,
  loadShifts,
  updateShift,
  updateSignupAttendance,
  type Shift,
  type SignupOutcome,
} from "@/lib/planning";

type EditableWindow = PlanningProposalWindow & {
  grill_required: boolean;
  proposed_grill_slots: number;
  grill_shift_splits_draft?: ProposalGrillShiftSplitInput[];
};

export function GrillPlanningPanel({ org, timezone }: Readonly<{ org: string; timezone: string }>) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [windows, setWindows] = useState<PlanningProposalWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [comparisonRows, setComparisonRows] = useState<ExternalPlanComparisonRow[]>([]);
  const [shiftsByWindow, setShiftsByWindow] = useState<Record<string, Shift[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadPlanningProposals(org, tab === "past");
      setWindows(result.windows);
      const loadedShifts = await Promise.all(
        result.windows.map(async (item) => {
          const eventId = item.covered_event_ids?.[0];
          if (!eventId) return [item.id, []] as const;
          try {
            return [item.id, await loadShifts(org, eventId)] as const;
          } catch {
            return [item.id, []] as const;
          }
        }),
      );
      setShiftsByWindow(Object.fromEntries(loadedShifts));
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
  }, [org, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const result = await refreshPlanningProposals(org, tab === "past");
      setWindows(result.windows);
      setSuccess("Grillvorschläge aus Spielbetrieb und Kiosk wurden aktualisiert.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Grillvorschläge konnten nicht aktualisiert werden.",
      );
    } finally {
      setRefreshing(false);
    }
  }

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
      // The confirm endpoint materialises the shift(s) from the already-persisted
      // override, not from this request. Persist any unsaved "Grillplätze"/
      // "Grillstatus"/split edits first so they are never silently discarded if
      // the admin clicks "bestätigen" without first clicking "speichern".
      await updatePlanningProposal(org, window.id, {
        grill_required: window.grill_required,
        proposed_grill_slots: window.grill_required ? window.proposed_grill_slots : 0,
      });
      if (window.grill_shift_splits_draft) {
        await updateGrillShiftSplits(org, window.id, window.grill_shift_splits_draft);
      }
      const updated = await confirmPlanningProposal(org, window.id, { kind: "grill" });
      setWindows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (updated.covered_event_ids?.[0]) {
        const confirmedShifts = await loadShifts(org, updated.covered_event_ids[0]);
        setShiftsByWindow((current) => ({
          ...current,
          [updated.id]: confirmedShifts,
        }));
      }
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

  async function reconcile(window: PlanningProposalWindow) {
    if (
      !globalThis.window.confirm(
        "Schichten mit der aktuell gespeicherten Aufteilung abgleichen? Nicht mehr passende " +
          "Schichten ohne Anmeldungen werden storniert.",
      )
    )
      return;
    setSavingId(window.id);
    setError(null);
    try {
      // Re-runs the same materialisation confirm() already performs — useful
      // for a window that was confirmed before a later split change, whose
      // now-orphaned shift was never cleaned up because confirming again is
      // otherwise not offered once a window is already confirmed.
      const updated = await confirmPlanningProposal(org, window.id, { kind: "grill" });
      setWindows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (updated.covered_event_ids?.[0]) {
        const confirmedShifts = await loadShifts(org, updated.covered_event_ids[0]);
        setShiftsByWindow((current) => ({
          ...current,
          [updated.id]: confirmedShifts,
        }));
      }
      setSuccess(`Schichten für ${formatDate(updated.date)} wurden abgeglichen.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Schichten konnten nicht abgeglichen werden.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function deleteConfirmed(window: PlanningProposalWindow) {
    const grillShifts = (shiftsByWindow[window.id] ?? []).filter(
      (shift) => shift.status !== "CANCELLED" && shift.shift_type === "GRILL",
    );
    const affectedSignups = grillShifts.reduce((total, shift) => total + shift.signups.length, 0);
    const warning =
      affectedSignups > 0
        ? `Diesen Grill-Einsatz vollständig löschen? Dabei werden alle zugehörigen Schichten storniert, ` +
          `einschließlich ${affectedSignups} ${
            affectedSignups === 1
              ? "bereits bestehenden Anmeldung"
              : "bereits bestehender Anmeldungen"
          }.`
        : "Diesen Grill-Einsatz vollständig löschen? Alle zugehörigen Schichten werden storniert.";
    if (!globalThis.window.confirm(warning)) return;
    setSavingId(window.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await deleteConfirmedWindow(org, window.id, "grill");
      setWindows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (updated.covered_event_ids?.[0]) {
        const remainingShifts = await loadShifts(org, updated.covered_event_ids[0]);
        setShiftsByWindow((current) => ({
          ...current,
          [updated.id]: remainingShifts,
        }));
      }
      setSuccess(`Grill-Einsatz für ${formatDate(updated.date)} wurde gelöscht.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Der Grill-Einsatz konnte nicht gelöscht werden.",
      );
    } finally {
      setSavingId(null);
    }
  }

  // Grill proposals may only ever be offered for a window whose kiosk half has
  // actually been confirmed by an admin (D-041/D-042); an unconfirmed or
  // never-touched window must not be selectable here even though the backend
  // also enforces this on confirm. The "past" tab requests include_past=true
  // (past AND upcoming), so it additionally filters down to past-only here;
  // the "upcoming" tab already gets a past-free list from the backend.
  const todayStr = new Date().toISOString().slice(0, 10);
  const openWindows = windows.filter(
    (window) =>
      window.kiosk_open &&
      window.kiosk_confirmed === true &&
      (tab === "past" ? window.date < todayStr : true),
  );

  return (
    <section className="grid gap-6" aria-labelledby="grill-title">
      <PageHeader
        headingId="grill-title"
        title="Grill"
        action={
          <Button disabled={loading || refreshing} onClick={() => void refresh()}>
            {refreshing ? "Wird aktualisiert" : "Vorschläge aus Kiosk aktualisieren"}
          </Button>
        }
        description="Grillvorschläge innerhalb geöffneter Kioskfenster – noch keine bestätigten Einsätze."
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
            <h2 className="text-lg font-semibold">
              {tab === "past" ? "Keine vergangenen Kioskfenster" : "Keine offenen Kioskfenster"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {tab === "past"
                ? "Für vergangene Spiele an Heimplätzen gibt es keine Grillvorschläge."
                : "Für die Spiele an Heimplätzen ist derzeit kein Kiosk geöffnet. Deshalb gibt es keine Grillvorschläge."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5">
          {openWindows.map((window) => (
            <GrillWindowCard
              key={window.id}
              window={window}
              org={org}
              timezone={timezone}
              saving={savingId === window.id}
              onSave={save}
              onConfirm={confirm}
              onReconcile={reconcile}
              onDelete={deleteConfirmed}
              comparison={comparisonRows.find((row) => row.proposal_window?.id === window.id)}
              shifts={shiftsByWindow[window.id] ?? []}
              onShiftsChanged={(updated) =>
                setShiftsByWindow((current) => ({ ...current, [window.id]: updated }))
              }
              onWindowUpdated={(updated) =>
                setWindows((current) =>
                  current.map((item) => (item.id === updated.id ? updated : item)),
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

type SplitDraft = { startTime: string; endTime: string; required: number };

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Time ranges within [windowStart, windowEnd) that no split currently covers,
 * so an admin who splits a window can see at a glance whether a slice was
 * left without a grill shift on purpose or by oversight. */
function uncoveredRanges(
  windowStartTime: string,
  windowEndTime: string,
  splits: SplitDraft[],
): Array<{ start: string; end: string }> {
  const windowStart = toMinutes(windowStartTime);
  const windowEnd = toMinutes(windowEndTime);
  const covered = splits
    .map((split): [number, number] => [toMinutes(split.startTime), toMinutes(split.endTime)])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  const gaps: Array<{ start: string; end: string }> = [];
  let cursor = windowStart;
  for (const [start, end] of covered) {
    const clippedStart = Math.max(start, windowStart);
    const clippedEnd = Math.min(end, windowEnd);
    if (clippedStart > cursor)
      gaps.push({ start: minutesToTime(cursor), end: minutesToTime(clippedStart) });
    cursor = Math.max(cursor, clippedEnd);
  }
  if (cursor < windowEnd)
    gaps.push({ start: minutesToTime(cursor), end: minutesToTime(windowEnd) });
  return gaps;
}

function ShiftEditRow({
  org,
  timezone,
  dateStr,
  shift,
  onCancel,
  onSaved,
}: Readonly<{
  org: string;
  timezone: string;
  dateStr: string;
  shift: Shift;
  onCancel: () => void;
  onSaved: (shift: Shift) => void;
}>) {
  const [startTime, setStartTime] = useState(formatTime(shift.starts_at, timezone));
  const [endTime, setEndTime] = useState(formatTime(shift.ends_at, timezone));
  const [required, setRequired] = useState(shift.required_volunteers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const startsAt = localTimeToIso(dateStr, startTime, timezone);
      const endsAt = localTimeToIso(dateStr, endTime, timezone);
      if (startsAt >= endsAt) {
        throw new Error("Die Startzeit muss vor der Endzeit liegen.");
      }
      const updated = await updateShift(org, shift.id, {
        starts_at: startsAt,
        ends_at: endsAt,
        required_volunteers: required,
      });
      onSaved(updated);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Einsatz konnte nicht aktualisiert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[6rem_6rem_6rem_auto_auto]">
      <label className="grid gap-1 text-sm">
        Von
        <input
          className="min-h-11 rounded-md border bg-background px-2"
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Bis
        <input
          className="min-h-11 rounded-md border bg-background px-2"
          type="time"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Helfer
        <input
          className="min-h-11 rounded-md border bg-background px-2"
          type="number"
          min={1}
          max={20}
          value={required}
          onChange={(event) => setRequired(Math.max(1, Number(event.target.value)))}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-status-error sm:col-span-full">
          {error}
        </p>
      ) : null}
      <Button className="self-end" type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "Speichert …" : "Speichern"}
      </Button>
      <Button className="self-end" type="button" variant="ghost" disabled={busy} onClick={onCancel}>
        Abbrechen
      </Button>
    </div>
  );
}

function GrillWindowCard({
  org,
  window,
  timezone,
  saving,
  onSave,
  onConfirm,
  onReconcile,
  onDelete,
  comparison,
  shifts,
  onShiftsChanged,
  onWindowUpdated,
}: Readonly<{
  org: string;
  window: PlanningProposalWindow;
  timezone: string;
  saving: boolean;
  onSave: (window: EditableWindow) => Promise<void>;
  onConfirm: (window: EditableWindow) => Promise<void>;
  onReconcile: (window: PlanningProposalWindow) => Promise<void>;
  onDelete: (window: PlanningProposalWindow) => Promise<void>;
  comparison?: ExternalPlanComparisonRow;
  shifts: Shift[];
  onShiftsChanged: (shifts: Shift[]) => void;
  onWindowUpdated: (window: PlanningProposalWindow) => void;
}>) {
  const [grillRequired, setGrillRequired] = useState(window.grill_required);
  const [slots, setSlots] = useState(window.proposed_grill_slots);
  const [confirmed, setConfirmed] = useState(window.grill_confirmed === true);
  const [splits, setSplits] = useState<SplitDraft[]>(() =>
    (window.grill_shift_splits ?? []).map((split) => ({
      startTime: formatTime(split.starts_at, timezone),
      endTime: formatTime(split.ends_at, timezone),
      required: split.required_volunteers,
    })),
  );
  const [splitsBusy, setSplitsBusy] = useState(false);
  const [splitsError, setSplitsError] = useState<string | null>(null);
  const [splitsSaved, setSplitsSaved] = useState(true);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const confirming = saving;
  const headingId = `grill-window-${window.id}`;
  const uncovered =
    splits.length > 0
      ? uncoveredRanges(
          formatTime(window.start_at, timezone),
          formatTime(window.end_at, timezone),
          splits,
        )
      : [];

  useEffect(() => {
    setGrillRequired(window.grill_required);
    setSlots(window.proposed_grill_slots);
    setConfirmed(window.grill_confirmed === true);
    setSplits(
      (window.grill_shift_splits ?? []).map((split) => ({
        startTime: formatTime(split.starts_at, timezone),
        endTime: formatTime(split.ends_at, timezone),
        required: split.required_volunteers,
      })),
    );
    setSplitsSaved(true);
  }, [window, timezone]);

  function splitsToPayload(): ProposalGrillShiftSplitInput[] {
    return splits.map((split) => ({
      starts_at: localTimeToIso(window.date, split.startTime, timezone),
      ends_at: localTimeToIso(window.date, split.endTime, timezone),
      required_volunteers: split.required,
    }));
  }

  async function saveSplits() {
    setSplitsBusy(true);
    setSplitsError(null);
    try {
      const payload = splitsToPayload();
      const orderingProblem = payload.find((split) => split.starts_at >= split.ends_at);
      if (orderingProblem) {
        throw new Error("Die Startzeit muss vor der Endzeit liegen.");
      }
      const updated = await updateGrillShiftSplits(org, window.id, payload);
      onWindowUpdated(updated);
      setSplitsSaved(true);
    } catch (caught) {
      setSplitsError(
        caught instanceof Error
          ? caught.message
          : "Die Aufteilung konnte nicht gespeichert werden.",
      );
    } finally {
      setSplitsBusy(false);
    }
  }

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
            <GameDayList
              heading="Abgedeckte Spiele"
              timezone={timezone}
              games={window.games.map((game, index) => ({
                id: `${game.kickoff_at}-${game.title}-${index}`,
                title: game.title,
                matchDescription: game.match_description,
                startsAt: game.kickoff_at || null,
              }))}
            />
          </div>

          <div className="rounded-md border p-4">
            <div className="flex items-center gap-2 font-semibold">
              {grillRequired ? (
                <CheckCircle2 aria-hidden="true" className="text-status-success" size={20} />
              ) : (
                <XCircle aria-hidden="true" className="text-status-neutral" size={20} />
              )}
              <span>
                Grill{" "}
                {grillRequired
                  ? confirmed
                    ? "geplant / bestätigt"
                    : "vorgeschlagen"
                  : "nicht vorgesehen"}
              </span>
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
          <div className="grid gap-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Schicht aufteilen (optional)</h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!grillRequired}
                onClick={() => {
                  setSplits((current) => [
                    ...current,
                    {
                      startTime: current.length
                        ? current[current.length - 1]!.endTime
                        : formatTime(window.start_at, timezone),
                      endTime: formatTime(window.end_at, timezone),
                      required: 1,
                    },
                  ]);
                  setSplitsSaved(false);
                }}
              >
                + Zeitfenster
              </Button>
            </div>
            {splits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ohne Aufteilung wird eine einzelne Schicht über das ganze Zeitfenster{" "}
                {formatTime(window.start_at, timezone)}–{formatTime(window.end_at, timezone)} Uhr
                mit {slots} {slots === 1 ? "Grillplatz" : "Grillplätzen"} angelegt.
              </p>
            ) : (
              <ul className="grid gap-2">
                {splits.map((split, index) => (
                  <li
                    key={index}
                    className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[6rem_6rem_6rem_auto]"
                  >
                    <label className="grid gap-1 text-sm">
                      Von
                      <input
                        className="min-h-11 rounded-md border bg-background px-2"
                        type="time"
                        value={split.startTime}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSplits((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, startTime: value } : item,
                            ),
                          );
                          setSplitsSaved(false);
                        }}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Bis
                      <input
                        className="min-h-11 rounded-md border bg-background px-2"
                        type="time"
                        value={split.endTime}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSplits((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, endTime: value } : item,
                            ),
                          );
                          setSplitsSaved(false);
                        }}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Helfer
                      <input
                        className="min-h-11 rounded-md border bg-background px-2"
                        type="number"
                        min={1}
                        max={20}
                        value={split.required}
                        onChange={(event) => {
                          const value = Math.max(1, Number(event.target.value));
                          setSplits((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, required: value } : item,
                            ),
                          );
                          setSplitsSaved(false);
                        }}
                      />
                    </label>
                    <Button
                      className="self-end"
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSplits((current) => current.filter((_, i) => i !== index));
                        setSplitsSaved(false);
                      }}
                    >
                      Entfernen
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {uncovered.length > 0 ? (
              <p className="text-sm text-status-warning" role="status">
                Nicht abgedeckt: {uncovered.map((gap) => `${gap.start}–${gap.end} Uhr`).join(", ")}.
                In dieser Zeit wird kein Grillplatz angelegt — falls das so gewollt ist, ist keine
                weitere Aktion nötig.
              </p>
            ) : null}
            {splitsError ? (
              <p className="text-sm text-status-error" role="alert">
                {splitsError}
              </p>
            ) : null}
            <Button
              className="justify-self-start"
              type="button"
              variant="secondary"
              disabled={splitsBusy || splitsSaved}
              onClick={() => void saveSplits()}
            >
              {splitsBusy ? "Wird gespeichert …" : "Aufteilung speichern"}
            </Button>
          </div>
        ) : null}
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
                  ...(splits.length > 0 ? { grill_shift_splits_draft: splitsToPayload() } : {}),
                });
              } finally {
                // callback owns persistence state
              }
            }}
          >
            {confirming ? "Wird angelegt …" : "Grill-Vorschlag bestätigen"}
          </Button>
        ) : (
          <div
            className="grid gap-2 rounded-md border border-status-success/30 bg-status-success/5 p-3"
            role="status"
          >
            <p className="font-medium text-status-success">Grill geplant / bestätigt</p>
            {shifts
              .filter((shift) => shift.status !== "CANCELLED" && shift.shift_type === "GRILL")
              .map((shift) =>
                editingShiftId === shift.id ? (
                  <ShiftEditRow
                    key={shift.id}
                    org={org}
                    timezone={timezone}
                    dateStr={window.date}
                    shift={shift}
                    onCancel={() => setEditingShiftId(null)}
                    onSaved={(updated) => {
                      onShiftsChanged(
                        shifts.map((item) => (item.id === updated.id ? updated : item)),
                      );
                      setEditingShiftId(null);
                    }}
                  />
                ) : (
                  <div key={shift.id} className="text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {formatTime(shift.starts_at, timezone)}–
                        {formatTime(shift.ends_at, timezone)} Uhr
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingShiftId(shift.id)}
                      >
                        Anpassen
                      </Button>
                    </div>
                    <p>
                      {shift.occupied_volunteers} von {shift.required_volunteers} Helfer angemeldet
                    </p>
                    {shift.signups.length ? (
                      <ul className="mt-2 grid gap-2">
                        {shift.signups.map((signup) => (
                          <li key={signup.id} className="rounded border p-3">
                            <p className="font-medium">
                              {signup.first_name} {signup.last_name}
                            </p>
                            <p className="text-muted-foreground">
                              {signup.phone} · {signup.email}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <select
                                className="min-h-11 rounded border bg-background px-2"
                                value={signup.outcome}
                                onChange={async (event) => {
                                  const updated = await updateSignupAttendance(
                                    org,
                                    signup.id,
                                    event.target.value as SignupOutcome,
                                  );
                                  onShiftsChanged(
                                    shifts.map((item) =>
                                      item.id === shift.id
                                        ? {
                                            ...item,
                                            signups: item.signups.map((entry) =>
                                              entry.id === updated.id ? updated : entry,
                                            ),
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                              >
                                <option value="OPEN">Noch offen</option>
                                <option value="ATTENDED">Anwesend</option>
                                <option value="EXCUSED_CANCELLED">Entschuldigt</option>
                                <option value="NO_SHOW">Nicht erschienen</option>
                              </select>
                              <Button
                                variant="destructive"
                                onClick={async () => {
                                  const updated = await cancelSignup(org, signup.id);
                                  onShiftsChanged(
                                    shifts.map((item) => (item.id === shift.id ? updated : item)),
                                  );
                                }}
                              >
                                Eintragung entfernen
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-status-error">Noch keine Helfer angemeldet</p>
                    )}
                  </div>
                ),
              )}
            <p className="text-xs text-muted-foreground">
              Zuordnung, Bearbeitung und Entfernung erfolgen im Bereich Anwesenheit.
            </p>
            <Button
              className="justify-self-start"
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => void onReconcile(window)}
            >
              Schichten abgleichen
            </Button>
            <p className="text-xs text-muted-foreground">
              Storniert Schichten, die zu keiner aktuell gespeicherten Aufteilung mehr passen (z. B.
              nach nachträglicher Änderung der Zeitfenster) — nur solange keine Helfer angemeldet
              sind.
            </p>
            <Button
              className="justify-self-start"
              type="button"
              variant="destructive"
              size="sm"
              disabled={saving}
              onClick={() => void onDelete(window)}
            >
              Einsatz löschen
            </Button>
            <p className="text-xs text-muted-foreground">
              Löscht den gesamten bestätigten Grill-Einsatz: Alle zugehörigen Schichten werden
              storniert (inklusive bestehender Anmeldungen) und das Fenster kehrt wieder in den
              unbestätigten Vorschlagszustand zurück.
            </p>
          </div>
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

/** Combine a "YYYY-MM-DD" proposal date with an "HH:MM" local time input into
 * an ISO instant, resolving the offset for the given IANA timezone. Mirrors
 * PlanningPanel's organizationDateTimeToIso (kept local to each panel like the
 * other date/time helpers in this file). */
function localTimeToIso(dateStr: string, timeStr: string, timezone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!,
    );
    instant += target - represented;
  }
  return new Date(instant).toISOString();
}
