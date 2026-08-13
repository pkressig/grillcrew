"use client";

import { CheckCircle2, CircleOff, Info, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ExternalPlanComparisonWorkspace } from "@/app/[org]/admin/external-plan-comparison";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { GameDayList } from "@/components/game-day-list";
import {
  loadPlanningProposals,
  confirmPlanningProposal,
  deleteConfirmedWindow,
  refreshPlanningProposals,
  updateKioskShiftSplits,
  updatePlanningProposal,
  type ProposalGrillShiftSplitInput,
  type ProposalWindow,
} from "@/lib/proposals";
import { loadShifts, updateShift, type Shift } from "@/lib/planning";

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
 * GrillPlanningPanel's identically-named helper (kept local to each panel like
 * the other date/time helpers in this file). */
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

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

type SplitDraft = { startTime: string; endTime: string; required: number };

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
      setError(errorText(caught, "Der Einsatz konnte nicht aktualisiert werden."));
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

function KioskWindowCard({
  org,
  timezone,
  window,
  shifts,
  onUpdated,
  onShiftsChanged,
}: Readonly<{
  org: string;
  timezone: string;
  window: ProposalWindow;
  shifts: Shift[];
  onUpdated: (window: ProposalWindow) => void;
  onShiftsChanged: (shifts: Shift[]) => void;
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
  const [splits, setSplits] = useState<SplitDraft[]>(() =>
    (window.kiosk_shift_splits ?? []).map((split) => ({
      startTime: formatTime(split.starts_at, timezone),
      endTime: formatTime(split.ends_at, timezone),
      required: split.required_volunteers,
    })),
  );
  const [splitsBusy, setSplitsBusy] = useState(false);
  const [splitsError, setSplitsError] = useState<string | null>(null);
  const [splitsSaved, setSplitsSaved] = useState(true);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  // Keep the card in sync with the server-confirmed proposal state (e.g. after
  // "Vorschläge aus Spielbetrieb aktualisieren" or a confirmation elsewhere) —
  // this component is keyed by window.id and does not remount on refresh.
  useEffect(() => {
    setStartsAt(inputDateTime(window.start_at));
    setEndsAt(inputDateTime(window.end_at));
    setKioskOpen(window.kiosk_open);
    setShiftCount(window.proposed_kiosk_slots ?? 1);
    setConfirmed(window.kiosk_confirmed === true);
    setSplits(
      (window.kiosk_shift_splits ?? []).map((split) => ({
        startTime: formatTime(split.starts_at, timezone),
        endTime: formatTime(split.ends_at, timezone),
        required: split.required_volunteers,
      })),
    );
    setSplitsSaved(true);
  }, [window, timezone]);

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
      const updated = await updateKioskShiftSplits(org, window.id, payload);
      onUpdated(updated);
      setSplitsSaved(true);
    } catch (caught) {
      setSplitsError(errorText(caught, "Die Aufteilung konnte nicht gespeichert werden."));
    } finally {
      setSplitsBusy(false);
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
      // The confirm endpoint materialises the shift(s) from the already-persisted
      // override, not from this request. Persist any unsaved split edits first
      // so they are never silently discarded if the admin clicks "bestätigen"
      // without first clicking "Aufteilung speichern" (mirrors Grill's pattern).
      if (splits.length > 0) {
        await updateKioskShiftSplits(org, window.id, splitsToPayload());
      }
      const updated = await confirmPlanningProposal(org, window.id, { kind: "kiosk" });
      setConfirmed(true);
      onUpdated(updated);
      if (updated.covered_event_ids?.[0]) {
        const confirmedShifts = await loadShifts(org, updated.covered_event_ids[0]);
        onShiftsChanged(confirmedShifts);
      }
    } catch (caught) {
      setError(errorText(caught, "Der Kiosk-Vorschlag konnte nicht bestätigt werden."));
    } finally {
      setConfirming(false);
    }
  }

  async function reconcile() {
    if (
      !globalThis.window.confirm(
        "Schichten mit der aktuell gespeicherten Aufteilung abgleichen? Nicht mehr passende " +
          "Schichten ohne Anmeldungen werden storniert.",
      )
    )
      return;
    setConfirming(true);
    setError(null);
    try {
      // Re-runs the same materialisation confirm() already performs — useful
      // for a window that was confirmed before a later split change, whose
      // now-orphaned shift was never cleaned up because confirming again is
      // otherwise not offered once a window is already confirmed.
      const updated = await confirmPlanningProposal(org, window.id, { kind: "kiosk" });
      onUpdated(updated);
      if (updated.covered_event_ids?.[0]) {
        const confirmedShifts = await loadShifts(org, updated.covered_event_ids[0]);
        onShiftsChanged(confirmedShifts);
      }
    } catch (caught) {
      setError(errorText(caught, "Die Schichten konnten nicht abgeglichen werden."));
    } finally {
      setConfirming(false);
    }
  }

  async function deleteConfirmed() {
    const kioskShifts = shifts.filter(
      (shift) => shift.status !== "CANCELLED" && shift.shift_type === "KIOSK",
    );
    const affectedSignups = kioskShifts.reduce((total, shift) => total + shift.signups.length, 0);
    const warning =
      affectedSignups > 0
        ? `Diesen Kiosk-Einsatz vollständig löschen? Dabei werden alle zugehörigen Schichten storniert, ` +
          `einschließlich ${affectedSignups} ${
            affectedSignups === 1
              ? "bereits bestehenden Anmeldung"
              : "bereits bestehender Anmeldungen"
          }.`
        : "Diesen Kiosk-Einsatz vollständig löschen? Alle zugehörigen Schichten werden storniert.";
    if (!globalThis.window.confirm(warning)) return;
    setConfirming(true);
    setError(null);
    try {
      const updated = await deleteConfirmedWindow(org, window.id, "kiosk");
      setConfirmed(false);
      onUpdated(updated);
      if (updated.covered_event_ids?.[0]) {
        const remainingShifts = await loadShifts(org, updated.covered_event_ids[0]);
        onShiftsChanged(remainingShifts);
      }
    } catch (caught) {
      setError(errorText(caught, "Der Kiosk-Einsatz konnte nicht gelöscht werden."));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card>
      <CardBody className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
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
            <GameDayList
              heading="Abgedeckte Spiele"
              timezone={timezone}
              games={window.games.map((game, index) => ({
                id: `${game.kickoff_at}-${game.title}-${index}`,
                title: game.title,
                startsAt: game.kickoff_at || null,
              }))}
            />
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
                onClick={() => void confirm()}
              >
                {confirming ? "Wird angelegt …" : "Kiosk-Vorschlag bestätigen"}
              </Button>
            ) : null}
            {!editing && error ? (
              <p role="alert" className="mt-3 text-sm text-status-error">
                {error}
              </p>
            ) : null}
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
                disabled={!kioskOpen}
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
                mit {shiftCount} {shiftCount === 1 ? "Helfer" : "Helfern"} angelegt.
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

        {confirmed ? (
          <div
            className="grid gap-3 rounded-md border border-status-success/30 bg-status-success/5 p-3"
            role="status"
          >
            <p className="font-medium text-status-success">Kiosk-Entwurf angelegt</p>
            {shifts
              .filter((shift) => shift.status !== "CANCELLED" && shift.shift_type === "KIOSK")
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
                  <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <p className="font-medium">
                        {formatTime(shift.starts_at, timezone)}–
                        {formatTime(shift.ends_at, timezone)} Uhr
                      </p>
                      <p>
                        {shift.occupied_volunteers} von {shift.required_volunteers} Helfer
                        angemeldet
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingShiftId(shift.id)}
                    >
                      Anpassen
                    </Button>
                  </div>
                ),
              )}
            <Button
              className="justify-self-start"
              type="button"
              variant="secondary"
              size="sm"
              disabled={confirming}
              onClick={() => void reconcile()}
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
              disabled={confirming}
              onClick={() => void deleteConfirmed()}
            >
              Einsatz löschen
            </Button>
            <p className="text-xs text-muted-foreground">
              Löscht den gesamten bestätigten Kiosk-Einsatz: Alle zugehörigen Schichten werden
              storniert (inklusive bestehender Anmeldungen) und das Fenster kehrt wieder in den
              unbestätigten Vorschlagszustand zurück.
            </p>
          </div>
        ) : null}
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
                    shifts={shiftsByWindow[window.id] ?? []}
                    onShiftsChanged={(updated) =>
                      setShiftsByWindow((current) => ({ ...current, [window.id]: updated }))
                    }
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
