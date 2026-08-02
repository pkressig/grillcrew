import { apiBaseUrl, csrfHeaders } from "@/lib/api";

export type SpielTyp = "MEISTERSCHAFT" | "CUP" | "TESTSPIEL" | "TURNIER";
export type ImportRowClassification =
  "NEU" | "GEAENDERT" | "VERSCHOBEN" | "ENTFERNT" | "UNVERAENDERT";
export type ImportRowDecision = "INCLUDE" | "EXCLUDE";
export type GrillShiftDecision = "PENDING" | "CREATE_SHIFT" | "NO_SHIFT";
export type ImportBatchStatus = "STAGED" | "CONFIRMED" | "DISCARDED";

export type ImportBatch = {
  id: string;
  organization_id: string;
  club_year_id: string;
  source_filename: string;
  uploaded_by_user_id: string;
  status: ImportBatchStatus;
  uploaded_at: string;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  row_count: number;
  created_at: string;
  updated_at: string;
};

export type ImportRow = {
  id: string;
  import_batch_id: string;
  season_id: string;
  sheet_tab: string;
  spiel_typ: SpielTyp;
  bezeichnung: string | null;
  spielnummer: string | null;
  weekday_short: string | null;
  game_date: string;
  game_time: string | null;
  teams: string;
  venue: string;
  venue_normalized: string;
  remark: string | null;
  is_home_venue: boolean;
  classification: ImportRowClassification;
  matched_event_id: string | null;
  diff_details: Record<string, unknown> | null;
  include_decision: ImportRowDecision;
  grill_shift_decision: GrillShiftDecision;
  verschoben_acknowledged_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatchWithRows = {
  batch: ImportBatch;
  rows: ImportRow[];
};

export type ImportRowUpdateInput = Partial<{
  include_decision: ImportRowDecision;
  grill_shift_decision: GrillShiftDecision;
  acknowledge_verschoben: boolean;
}>;

async function request<T>(path: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const fallbackMessage = errorMessage ?? "Der Import konnte nicht verarbeitet werden.";
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  } catch {
    throw new Error(fallbackMessage);
  }
  if (!response.ok) {
    let detail: unknown;
    try {
      ({ detail } = (await response.json()) as { detail?: unknown });
    } catch {
      // The operation-specific fallback is used for non-JSON error responses.
    }
    throw new Error(typeof detail === "string" && detail.trim() ? detail : fallbackMessage);
  }
  return (await response.json()) as T;
}

const base = (org: string) => `/api/admin/${encodeURIComponent(org)}/imports`;

export type ImportFilters = {
  importStartDate?: string;
  importEndDate?: string;
  futureOnly?: boolean;
  homeOnly?: boolean;
};
export const uploadImportBatch = (
  org: string,
  clubYearId: string,
  file: File,
  filters: ImportFilters = {},
) => {
  const formData = new FormData();
  formData.append("club_year_id", clubYearId);
  formData.append("file", file);
  if (filters.importStartDate) formData.append("import_start_date", filters.importStartDate);
  if (filters.importEndDate) formData.append("import_end_date", filters.importEndDate);
  if (filters.futureOnly) formData.append("future_only", "true");
  if (filters.homeOnly) formData.append("home_only", "true");
  return request<ImportBatchWithRows>(
    base(org),
    { method: "POST", headers: { ...csrfHeaders() }, body: formData },
    "Die Datei konnte nicht importiert werden.",
  );
};

export const loadImportRows = (org: string, batchId: string) =>
  request<ImportBatchWithRows>(
    `${base(org)}/${encodeURIComponent(batchId)}/rows`,
    undefined,
    "Der Import konnte nicht geladen werden.",
  );

export const updateImportRow = (
  org: string,
  batchId: string,
  rowId: string,
  payload: ImportRowUpdateInput,
) =>
  request<ImportRow>(
    `${base(org)}/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(rowId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
    "Die Zeile konnte nicht gespeichert werden.",
  );

export const confirmImportBatch = (org: string, batchId: string) =>
  request<ImportBatchWithRows>(
    `${base(org)}/${encodeURIComponent(batchId)}/confirm`,
    { method: "POST", headers: { ...csrfHeaders() } },
    "Der Import konnte nicht bestätigt werden.",
  );
