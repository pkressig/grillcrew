"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  loadOneDriveConfig,
  saveOneDriveConfig,
  syncOneDriveNow,
  type OneDriveConfig,
  type OneDriveConfigInput,
} from "@/lib/onedrive-sync";
import type { ClubYear } from "@/lib/planning";
const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
export function OneDriveSyncCard({
  org,
  clubYears,
  onReview,
}: {
  org: string;
  clubYears: ClubYear[];
  onReview: (batchId: string) => void;
}) {
  const [config, setConfig] = useState<OneDriveConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadOneDriveConfig(org)
      .then((loaded) => {
        if (active) setConfig(loaded);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [org]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const input: OneDriveConfigInput = {
      club_year_id: String(d.get("club_year_id")),
      source_url: String(d.get("source_url")),
      enabled: d.get("enabled") === "on",
      daily_time: String(d.get("daily_time")),
      import_start_date: String(d.get("import_start_date")),
      import_end_date: String(d.get("import_end_date")) || null,
      future_only: d.get("future_only") === "on",
    };
    setBusy(true);
    setError(null);
    try {
      setConfig(await saveOneDriveConfig(org, input));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const run = await syncOneDriveNow(org);
      setConfig((c) => (c ? { ...c, last_run: run } : c));
      if (run.import_batch_id) onReview(run.import_batch_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const run = config?.last_run;
  return (
    <Card>
      <CardBody className="grid gap-4">
        <div>
          <h2 className="text-xl font-semibold">OneDrive-Synchronisation</h2>
          <p className="text-sm text-muted-foreground">
            Die Arbeitsmappe wird ausschliesslich gelesen. Änderungen werden nur zur Prüfung
            bereitgestellt und nie automatisch übernommen.
          </p>
        </div>
        <form className="grid gap-3" onSubmit={save}>
          <label>
            OneDrive-Arbeitsmappenlink
            <input
              className={control}
              name="source_url"
              type="url"
              required
              defaultValue={config?.source_url}
            />
          </label>
          <label>
            Ziel-Vereinsjahr für OneDrive
            <select className={control} name="club_year_id" defaultValue={config?.club_year_id}>
              {clubYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tägliche Synchronisationszeit
            <input
              className={control}
              name="daily_time"
              type="time"
              required
              defaultValue={config?.daily_time?.slice(0, 5) || "03:00"}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Import ab
              <input
                className={control}
                name="import_start_date"
                type="date"
                required
                defaultValue={config?.import_start_date}
              />
            </label>
            <label>
              Import bis (optional)
              <input
                className={control}
                name="import_end_date"
                type="date"
                defaultValue={config?.import_end_date || ""}
              />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input
              name="future_only"
              type="checkbox"
              defaultChecked={config?.future_only ?? true}
            />
            Nur ab heute und zukünftige Spiele
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input name="enabled" type="checkbox" defaultChecked={config?.enabled} />
            Tägliche Synchronisation aktiviert
          </label>
          <p className="text-sm text-muted-foreground">
            Der manuelle Download bleibt auch bei deaktivierter täglicher Synchronisation
            verfügbar. Nach dem Download wird ein Importentwurf zur Prüfung geöffnet.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="submit">
              Konfiguration speichern
            </Button>
            <Button disabled={busy || !config} type="button" variant="secondary" onClick={sync}>
              Jetzt synchronisieren
            </Button>
          </div>
        </form>
        {config?.next_run_at ? (
          <p>Nächster Lauf: {new Date(config.next_run_at).toLocaleString("de-CH")}</p>
        ) : (
          <p>Tägliche Synchronisation deaktiviert.</p>
        )}
        {run ? (
          <div>
            <p>
              Letzter Lauf: {new Date(run.started_at).toLocaleString("de-CH")} – {run.status}
            </p>
            <p>
              Datei: {run.source_filename || "–"}, SHA-256: <code>{run.content_sha256}</code>,{" "}
              {run.row_count} Zeilen
            </p>
            <p>
              Zeitraum: {run.effective_start_date} bis {run.effective_end_date || "offen"}
            </p>
            {run.comparison_summary ? (
              <p>Vergleich: {JSON.stringify(run.comparison_summary)}</p>
            ) : null}
            {run.error_message ? <p role="alert">Fehler: {run.error_message}</p> : null}
          </div>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </CardBody>
    </Card>
  );
}
