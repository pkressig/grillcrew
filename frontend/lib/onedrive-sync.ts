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
  fetch(base(org), { credentials: "include" }).then(parse<OneDriveConfig | null>);
export const saveOneDriveConfig = (org: string, input: OneDriveConfigInput) =>
  fetch(base(org), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(input),
  }).then(parse<OneDriveConfig>);
export const syncOneDriveNow = (org: string) =>
  fetch(`${base(org)}/sync`, {
    method: "POST",
    credentials: "include",
    headers: { ...csrfHeaders() },
  }).then(parse<OneDriveRun>);
