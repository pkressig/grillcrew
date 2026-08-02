"use client";

import { CalendarClock, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StatSummary } from "@/components/ui/stat-summary";
import {
  confirmImportBatch,
  loadImportRows,
  updateImportRow,
  uploadImportBatch,
  type GrillShiftDecision,
  type ImportBatchWithRows,
  type ImportRow,
  type ImportRowClassification,
  type ImportRowDecision,
  type SpielTyp,
} from "@/lib/imports";
import { loadPlanning, type ClubYear } from "@/lib/planning";
import { OneDriveSyncCard } from "./onedrive-sync-card";

const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";

const classificationLabels: Record<ImportRowClassification, string> = {
  NEU: "Neu",
  GEAENDERT: "Geändert",
  VERSCHOBEN: "Verschoben",
  ENTFERNT: "Entfernt",
  UNVERAENDERT: "Unverändert",
};
const classificationBadgeVariant: Record<
  ImportRowClassification,
  "success" | "warning" | "error" | "neutral"
> = {
  NEU: "success",
  GEAENDERT: "warning",
  VERSCHOBEN: "warning",
  ENTFERNT: "error",
  UNVERAENDERT: "neutral",
};
const spielTypLabels: Record<SpielTyp, string> = {
  MEISTERSCHAFT: "Meisterschaft",
  CUP: "Cup",
  TESTSPIEL: "Testspiel",
  TURNIER: "Turnier",
};
const CLASSIFICATION_ORDER: ImportRowClassification[] = [
  "NEU",
  "GEAENDERT",
  "VERSCHOBEN",
  "ENTFERNT",
  "UNVERAENDERT",
];
const CLASSIFICATION_STAT_ORDER: ImportRowClassification[] = [
  "NEU",
  "GEAENDERT",
  "VERSCHOBEN",
  "ENTFERNT",
];
const classificationIcons: Record<ImportRowClassification, ReactNode> = {
  NEU: <PlusCircle aria-hidden="true" />,
  GEAENDERT: <Pencil aria-hidden="true" />,
  VERSCHOBEN: <CalendarClock aria-hidden="true" />,
  ENTFERNT: <Trash2 aria-hidden="true" />,
  UNVERAENDERT: <PlusCircle aria-hidden="true" />,
};

function isOverridden(row: ImportRow): boolean {
  const defaultDecision: ImportRowDecision = row.is_home_venue ? "INCLUDE" : "EXCLUDE";
  return row.include_decision !== defaultDecision;
}

export function ImportPanel({ org }: Readonly<{ org: string }>) {
  const [clubYears, setClubYears] = useState<ClubYear[]>([]);
  const [clubYearsLoading, setClubYearsLoading] = useState(true);
  const [clubYearsError, setClubYearsError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportBatchWithRows | null>(null);

  const refreshClubYears = useCallback(async () => {
    setClubYearsError(null);
    try {
      const { clubYears: loaded } = await loadPlanning(org);
      setClubYears(loaded);
    } catch (caught) {
      setClubYearsError(
        caught instanceof Error ? caught.message : "Die Vereinsjahre konnten nicht geladen werden.",
      );
    } finally {
      setClubYearsLoading(false);
    }
  }, [org]);
  useEffect(() => void refreshClubYears(), [refreshClubYears]);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const clubYearId = String(data.get("club_year_id") ?? "");
    const fileList = (form.elements.namedItem("file") as HTMLInputElement | null)?.files;
    const file = fileList?.[0];
    if (!clubYearId || !file) {
      setUploadError("Bitte Vereinsjahr und Datei auswählen.");
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    try {
      setResult(await uploadImportBatch(org, clubYearId, file));
    } catch (caught) {
      setUploadError(
        caught instanceof Error ? caught.message : "Die Datei konnte nicht importiert werden.",
      );
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <section className="grid gap-7" aria-labelledby="import-heading">
      <PageHeader
        headingId="import-heading"
        title="Spielplan-Import"
        description="Heimspielplan hochladen, Änderungen prüfen und übernehmen."
      />
      <OneDriveSyncCard
        org={org}
        clubYears={clubYears}
        onReview={(batchId) =>
          void loadImportRows(org, batchId)
            .then(setResult)
            .catch((caught: unknown) =>
              setUploadError(
                caught instanceof Error
                  ? caught.message
                  : "Der Import konnte nicht geladen werden.",
              ),
            )
        }
      />
      {!result ? (
        <Card className="border-border/80">
          <CardBody className="grid gap-4">
            {clubYearsLoading ? (
              <p role="status">Vereinsjahre werden geladen …</p>
            ) : clubYearsError ? (
              <p
                className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
                role="alert"
              >
                {clubYearsError}
              </p>
            ) : clubYears.length === 0 ? (
              <p>
                Noch kein Vereinsjahr vorhanden. Bitte zuerst in der Planung ein Vereinsjahr mit den
                passenden Saisons (Herbst/Frühling) anlegen.
              </p>
            ) : (
              <form className="grid gap-3" onSubmit={submitUpload}>
                <label className="grid gap-1" htmlFor="import-club-year">
                  Vereinsjahr
                  <select
                    className={control}
                    id="import-club-year"
                    name="club_year_id"
                    disabled={uploadBusy}
                  >
                    {clubYears.map((clubYear) => (
                      <option
                        key={clubYear.id}
                        value={clubYear.id}
                        disabled={clubYear.status === "CLOSED" || clubYear.status === "ARCHIVED"}
                      >
                        {clubYear.label}
                        {clubYear.status === "CLOSED"
                          ? " (geschlossen)"
                          : clubYear.status === "ARCHIVED"
                            ? " (archiviert)"
                            : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1" htmlFor="import-file">
                  Heimspielplan (Excel-Datei)
                  <input
                    accept=".xlsx"
                    className={control}
                    id="import-file"
                    name="file"
                    required
                    type="file"
                    disabled={uploadBusy}
                  />
                </label>
                <Button className="justify-self-start" type="submit" disabled={uploadBusy}>
                  {uploadBusy ? "Wird geladen …" : "Datei hochladen und prüfen"}
                </Button>
              </form>
            )}
            {uploadError ? (
              <p
                className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
                role="alert"
              >
                {uploadError}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <ImportReview
          org={org}
          result={result}
          onResult={setResult}
          onStartOver={() => setResult(null)}
        />
      )}
    </section>
  );
}

function ImportReview({
  org,
  result,
  onResult,
  onStartOver,
}: Readonly<{
  org: string;
  result: ImportBatchWithRows;
  onResult: (result: ImportBatchWithRows) => void;
  onStartOver: () => void;
}>) {
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { batch, rows } = result;
  const isStaged = batch.status === "STAGED";

  const grouped = useMemo(() => {
    const groups = new Map<ImportRowClassification, ImportRow[]>();
    for (const classification of CLASSIFICATION_ORDER) groups.set(classification, []);
    for (const row of rows) groups.get(row.classification)?.push(row);
    return groups;
  }, [rows]);

  async function refresh() {
    onResult(await loadImportRows(org, batch.id));
  }

  async function patchRow(rowId: string, payload: Parameters<typeof updateImportRow>[3]) {
    setBusyRowId(rowId);
    setError(null);
    setSuccess(null);
    try {
      await updateImportRow(org, batch.id, rowId, payload);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Zeile konnte nicht gespeichert werden.",
      );
    } finally {
      setBusyRowId(null);
    }
  }

  async function confirm() {
    const includedCount = rows.filter((row) => row.include_decision === "INCLUDE").length;
    if (
      !window.confirm(`${includedCount} von ${rows.length} Zeilen werden übernommen. Fortfahren?`)
    )
      return;
    setConfirmBusy(true);
    setError(null);
    setSuccess(null);
    try {
      onResult(await confirmImportBatch(org, batch.id));
      setSuccess("Import wurde übernommen.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Import konnte nicht bestätigt werden.",
      );
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="border-border/80">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{batch.source_filename}</p>
            <p className="text-sm text-muted-foreground">
              {batch.row_count} Zeilen · Status: {isStaged ? "In Prüfung" : "Übernommen"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isStaged ? (
              <Button disabled={confirmBusy} onClick={() => void confirm()}>
                {confirmBusy ? "Wird übernommen …" : "Import übernehmen"}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onStartOver}>
              Neuer Import
            </Button>
          </div>
        </CardBody>
      </Card>
      <dl
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Übersicht nach Klassifikation"
      >
        {CLASSIFICATION_STAT_ORDER.map((classification) => (
          <StatSummary
            key={classification}
            label={classificationLabels[classification]}
            value={grouped.get(classification)?.length ?? 0}
            icon={classificationIcons[classification]}
          />
        ))}
      </dl>
      {error ? (
        <p
          className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-md border border-status-success/30 bg-status-success/5 p-3 text-sm text-status-success"
          role="status"
        >
          {success}
        </p>
      ) : null}
      {CLASSIFICATION_ORDER.map((classification) => {
        const items = grouped.get(classification) ?? [];
        if (items.length === 0) return null;
        const heading = (
          <h2 className="text-lg font-semibold">
            {classificationLabels[classification]} ({items.length})
          </h2>
        );
        const list = (
          <ul className="mt-3 grid gap-3" aria-label={classificationLabels[classification]}>
            {items.map((row) => (
              <ImportRowCard
                key={row.id}
                row={row}
                busy={busyRowId === row.id}
                disabled={!isStaged}
                onPatch={(payload) => void patchRow(row.id, payload)}
              />
            ))}
          </ul>
        );
        if (classification === "UNVERAENDERT") {
          return (
            <details key={classification} className="rounded-md border p-4">
              <summary className="cursor-pointer">
                <span className="font-semibold">
                  {classificationLabels[classification]} ({items.length})
                </span>
              </summary>
              {list}
            </details>
          );
        }
        return (
          <section key={classification} aria-labelledby={`import-group-${classification}`}>
            {heading}
            {list}
          </section>
        );
      })}
    </div>
  );
}

function ImportRowCard({
  row,
  busy,
  disabled,
  onPatch,
}: Readonly<{
  row: ImportRow;
  busy: boolean;
  disabled: boolean;
  onPatch: (payload: Parameters<typeof updateImportRow>[3]) => void;
}>) {
  const overridden = isOverridden(row);
  const isRemoved = row.classification === "ENTFERNT";
  return (
    <li>
      <Card className="shadow-none">
        <CardBody className="grid gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">
                {row.weekday_short ? `${row.weekday_short}. ` : ""}
                {row.game_date}
                {row.game_time ? ` · ${row.game_time.slice(0, 5)}` : ""} — {row.teams}
              </p>
              <p className="text-sm text-muted-foreground">
                {spielTypLabels[row.spiel_typ]} · {row.venue}
                {row.bezeichnung ? ` · ${row.bezeichnung}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={classificationBadgeVariant[row.classification]}>
                {classificationLabels[row.classification]}
              </Badge>
              <Badge variant={row.is_home_venue ? "success" : "neutral"}>
                {row.is_home_venue ? "Heimplatz" : "Kein Heimplatz"}
              </Badge>
              {overridden ? <Badge variant="warning">manuell überschrieben</Badge> : null}
            </div>
          </div>
          {row.remark ? (
            <p className="text-sm">
              <span className="font-medium">Bemerkung:</span> {row.remark}
            </p>
          ) : null}
          {row.classification === "VERSCHOBEN" && row.diff_details ? (
            <p className="text-sm text-status-warning">
              Termin hat sich geändert — bitte betroffene Helfer ausserhalb der App kontaktieren.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm" htmlFor={`include-${row.id}`}>
              Übernehmen
              <select
                className={control}
                disabled={disabled || busy || isRemoved}
                id={`include-${row.id}`}
                value={row.include_decision}
                onChange={(event) =>
                  onPatch({ include_decision: event.target.value as typeof row.include_decision })
                }
              >
                <option value="INCLUDE">Ja</option>
                <option value="EXCLUDE">Nein</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm" htmlFor={`grill-shift-${row.id}`}>
              Grill-Einsatz?
              <select
                className={control}
                disabled={disabled || busy || isRemoved}
                id={`grill-shift-${row.id}`}
                value={row.grill_shift_decision}
                onChange={(event) =>
                  onPatch({
                    grill_shift_decision: event.target.value as GrillShiftDecision,
                  })
                }
              >
                <option value="PENDING">Offen</option>
                <option value="CREATE_SHIFT">Ja</option>
                <option value="NO_SHIFT">Nein</option>
              </select>
            </label>
            {row.classification === "VERSCHOBEN" ? (
              <div className="grid gap-1 text-sm">
                <span>Helfer kontaktiert</span>
                {row.verschoben_acknowledged_at ? (
                  <Badge className="w-fit" variant="success">
                    erledigt
                  </Badge>
                ) : (
                  <Button
                    disabled={disabled || busy}
                    size="sm"
                    variant="secondary"
                    onClick={() => onPatch({ acknowledge_verschoben: true })}
                  >
                    Als erledigt markieren
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </li>
  );
}
