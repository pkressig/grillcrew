"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  loadExternalPlanComparison,
  reviewExternalPlanRow,
  uploadExternalPlan,
  type ExternalPlanComparison,
  type ExternalPlanComparisonRow,
  type ExternalPlanStatus,
} from "@/lib/external-kiosk-plan";

const statusText: Record<ExternalPlanStatus, string> = {
  MATCH: "Zeitfenster stimmt überein",
  MISSING_IN_EXTERNAL: "Fehlt im Excelplan",
  EXTRA_IN_EXTERNAL: "Nur im Excelplan",
  TIME_MISMATCH: "Zeitabweichung",
  PERSON_ASSIGNMENT_PRESENT: "Personenzuteilung vorhanden",
};

function time(value: string | null, timezone: string) {
  if (!value) return "Zeit nicht eindeutig";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function ExternalPlanComparisonWorkspace({
  org,
  timezone,
}: Readonly<{ org: string; timezone: string }>) {
  const inputId = useId();
  const [comparison, setComparison] = useState<ExternalPlanComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setComparison(await loadExternalPlanComparison(org));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Vergleich konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);
  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      setComparison(await uploadExternalPlan(org, file));
      setSuccess(
        "Excelplan wurde importiert und zum Prüfen bereitgestellt. Vorschläge und Einsätze wurden nicht verändert.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Excelplan konnte nicht hochgeladen werden.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function reviewed(
    row: ExternalPlanComparisonRow,
    state: "ACKNOWLEDGED" | "OVERRIDDEN",
    note: string,
  ) {
    if (!comparison) return;
    setError(null);
    setSuccess(null);
    try {
      const updated = await reviewExternalPlanRow(org, comparison.import_id, row.id, state, note);
      setComparison({
        ...comparison,
        rows: comparison.rows.map((item) => (item.id === row.id ? { ...item, ...updated } : item)),
      });
      setSuccess(
        state === "OVERRIDDEN"
          ? "Abweichung wurde ausdrücklich manuell übersteuert."
          : "Vergleichszeile wurde bestätigt.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Prüfung konnte nicht gespeichert werden.",
      );
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="external-plan-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 id="external-plan-title" className="text-xl font-semibold">
            Externer Kiosk- und Grillplan
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Excelplan separat importieren, vergleichen und Abweichungen ausdrücklich prüfen.
          </p>
        </div>
        <div>
          <label
            htmlFor={inputId}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground"
          >
            <Upload aria-hidden="true" size={18} />
            {uploading ? "Wird importiert …" : "Excelplan hochladen"}
          </label>
          <input
            id={inputId}
            className="sr-only"
            type="file"
            accept=".xlsx"
            disabled={uploading}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Nur .xlsx. Der Import erzeugt keine Schichten oder Anmeldungen und ändert keine
        Spielbetrieb-Vorschläge.
      </p>
      {success ? (
        <p
          role="status"
          className="rounded-md border border-status-success/30 bg-status-success/10 p-3"
        >
          {success}
        </p>
      ) : null}
      {error ? (
        <Card role="alert">
          <CardBody>
            <p className="text-status-error">{error}</p>
            <Button className="mt-3" variant="secondary" onClick={() => void load()}>
              Erneut laden
            </Button>
          </CardBody>
        </Card>
      ) : null}
      {loading ? (
        <Card role="status">
          <CardBody>Externer Planvergleich wird geladen …</CardBody>
        </Card>
      ) : !error && !comparison ? (
        <Card role="status">
          <CardBody>
            <FileSpreadsheet aria-hidden="true" className="mb-3 text-muted-foreground" />
            <h3 className="font-semibold">Noch kein externer Plan importiert</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Laden Sie den aktuellen Koordinationsplan hoch, um ihn neben den Vorschlägen zu
              prüfen.
            </p>
          </CardBody>
        </Card>
      ) : null}
      {!loading && comparison ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Import: <span className="font-medium text-foreground">{comparison.filename}</span>
          </p>
          {comparison.rows.length === 0 ? (
            <Card role="status">
              <CardBody>
                Der importierte Plan enthält keine vergleichbaren Kiosk- oder Grillzeilen.
              </CardBody>
            </Card>
          ) : (
            comparison.rows.map((row) => (
              <ComparisonRow key={row.id} row={row} timezone={timezone} onReview={reviewed} />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

function ComparisonRow({
  row,
  timezone,
  onReview,
}: Readonly<{
  row: ExternalPlanComparisonRow;
  timezone: string;
  onReview: (
    row: ExternalPlanComparisonRow,
    state: "ACKNOWLEDGED" | "OVERRIDDEN",
    note: string,
  ) => Promise<void>;
}>) {
  const [note, setNote] = useState(row.review_note ?? "");
  const [saving, setSaving] = useState(false);
  async function save(state: "ACKNOWLEDGED" | "OVERRIDDEN") {
    setSaving(true);
    try {
      await onReview(row, state, note);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardBody className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            {row.proposal_window?.date ?? row.external_entries[0]?.date}
          </h3>
          <Badge variant={row.review_state === "OPEN" ? "warning" : "success"}>
            {row.review_state === "OPEN"
              ? "Prüfung offen"
              : row.review_state === "OVERRIDDEN"
                ? "Manuell übersteuert"
                : "Bestätigt"}
          </Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-3" aria-label="Planvergleich">
          <section className="rounded-md border p-4" aria-label="Spielbetrieb-Vorschlag">
            <h4 className="font-semibold">Spielbetrieb-Vorschlag</h4>
            {row.proposal_window ? (
              <>
                <p className="mt-2">
                  {time(row.proposal_window.start_at, timezone)}–
                  {time(row.proposal_window.end_at, timezone)} Uhr
                </p>
                <p className="mt-1 text-sm">
                  Kiosk {row.proposal_window.kiosk_open ? "offen" : "geschlossen"} · Grill{" "}
                  {row.proposal_window.grill_required ? "erforderlich" : "nicht erforderlich"}
                </p>
                <ul className="mt-3 grid gap-1 text-sm">
                  {row.proposal_window.games.map((game) => (
                    <li key={`${game.kickoff_at}-${game.title}`}>
                      {time(game.kickoff_at, timezone)} · {game.title} · {game.venue}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Kein passendes Vorschlagsfenster.
              </p>
            )}
          </section>
          <section className="rounded-md border p-4" aria-label="Importierter Excelplan">
            <h4 className="font-semibold">Importierter Excelplan</h4>
            {row.external_entries.length ? (
              <ul className="mt-2 grid gap-3">
                {row.external_entries.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <span className="font-medium">
                      {entry.category === "KIOSK" ? "Kiosk" : "Grill"}:{" "}
                      {time(entry.start_at, timezone)}–{time(entry.end_at, timezone)}
                    </span>
                    <span className="block">
                      Zuteilung: {entry.assigned_person_text || "Keine Angabe"}
                    </span>
                    {entry.source_note ? (
                      <span className="block text-muted-foreground">
                        Notiz: {entry.source_note}
                      </span>
                    ) : null}
                    {entry.raw_text ? (
                      <span className="block text-xs text-muted-foreground">
                        Original: {entry.raw_text}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Keine Zeile im Excelplan.</p>
            )}
          </section>
          <section className="rounded-md border p-4" aria-label="Unterschied und Status">
            <h4 className="font-semibold">Unterschied / Status</h4>
            <ul className="mt-2 grid gap-2">
              {row.statuses.map((status) => (
                <li key={status} className="flex gap-2 text-sm">
                  {status === "MATCH" ? (
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-5 shrink-0 text-status-success"
                    />
                  ) : (
                    <AlertTriangle
                      aria-hidden="true"
                      className="size-5 shrink-0 text-status-warning"
                    />
                  )}
                  <span>{statusText[status]}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {row.external_entries.length ? (
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="grid gap-1 text-sm font-medium">
              Prüfnotiz
              <input
                className="min-h-11 rounded-md border bg-background px-3"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optionaler Prüfvermerk"
              />
            </label>
            <Button disabled={saving} variant="secondary" onClick={() => void save("ACKNOWLEDGED")}>
              Zeile bestätigen
            </Button>
            <Button disabled={saving || !note.trim()} onClick={() => void save("OVERRIDDEN")}>
              Manuell übersteuern
            </Button>
          </div>
        ) : (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Im Excelplan fehlt eine prüfbare Zeile. Der Spielbetrieb-Vorschlag kann unten separat
            manuell angepasst werden.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Bestätigung und Übersteuerung dokumentieren nur die Prüfung; Vorschläge und bestätigte
          Einsätze bleiben unverändert.
        </p>
      </CardBody>
    </Card>
  );
}
