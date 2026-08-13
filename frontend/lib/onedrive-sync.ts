import { apiBaseUrl, csrfHeaders } from "@/lib/api";
export type OneDriveRun = {
  id: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED_UNCHANGED";
  source_filename: string | null;
  content_sha256: string;
  effective_start_date: string;
  effective_end_date: string | null;
  row_count: number;
  comparison_summary: Record<string, unknown> | null;
  error_message: string | null;
  import_batch_id: string | null;
  started_at: string;
  finished_at: string | null;
};
export type OneDriveConfig = {
  id: string;
  club_year_id: string;
  source_url: string;
  enabled: boolean;
  daily_time: string;
  import_start_date: string;
  import_end_date: string | null;
  future_only: boolean;
  next_run_at: string | null;
  last_run: OneDriveRun | null;
};
export type OneDriveConfigInput = Omit<OneDriveConfig, "id" | "next_run_at" | "last_run">;
const base = (org: string) => `${apiBaseUrl}/api/admin/${encodeURIComponent(org)}/onedrive-sync`;
// A network-level failure (connection dropped, CORS rejection, DNS failure, offline) makes
// fetch() itself reject with a raw, untranslated browser error (e.g. "Failed to fetch" in
// Chrome, "NetworkError when attempting to fetch resource." in Firefox). Without this guard
// that raw TypeError propagated straight to the admin UI verbatim; catching it here and
// raising an honest, German, actionable message instead keeps the error state readable.
async function fetchOrThrow(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { credentials: "include", ...init });
  } catch {
    throw new Error(
      "Die Verbindung zum Server ist fehlgeschlagen. Bitte Internetverbindung prüfen und " +
        "erneut versuchen.",
    );
  }
}
async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = "OneDrive-Synchronisation fehlgeschlagen.";
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}
export const loadOneDriveConfig = (org: string) =>
  fetchOrThrow(base(org)).then(parse<OneDriveConfig | null>);
export const saveOneDriveConfig = (org: string, input: OneDriveConfigInput) =>
  fetchOrThrow(base(org), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(input),
  }).then(parse<OneDriveConfig>);
export const syncOneDriveNow = (org: string) =>
  fetchOrThrow(`${base(org)}/sync`, {
    method: "POST",
    headers: { ...csrfHeaders() },
  }).then(parse<OneDriveRun>);
