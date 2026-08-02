import { apiBaseUrl, csrfHeaders, ensureCsrfToken } from "@/lib/api";

export type ExternalPlanStatus =
  | "MATCH"
  | "MISSING_IN_EXTERNAL"
  | "EXTRA_IN_EXTERNAL"
  | "TIME_MISMATCH"
  | "PERSON_ASSIGNMENT_PRESENT";

export type ExternalReviewState = "OPEN" | "ACKNOWLEDGED" | "OVERRIDDEN";

export type ExternalPlanEntry = {
  id: string;
  date: string;
  start_at: string | null;
  end_at: string | null;
  category: "KIOSK" | "GRILL";
  assigned_person_text: string | null;
  source_note: string | null;
  raw_text: string | null;
};

export type ExternalPlanComparisonRow = {
  id: string;
  proposal_window: {
    id: string;
    date: string;
    start_at: string;
    end_at: string;
    kiosk_open: boolean;
    grill_required: boolean;
    games: { title: string; kickoff_at: string; venue: string }[];
  } | null;
  external_entries: ExternalPlanEntry[];
  statuses: ExternalPlanStatus[];
  review_state: ExternalReviewState;
  review_note: string | null;
};

export type ExternalPlanComparison = {
  import_id: string;
  filename: string;
  imported_at: string;
  rows: ExternalPlanComparisonRow[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail;
    } catch {
      // Keep the stable fallback for non-JSON responses.
    }
    throw new Error(
      typeof detail === "string"
        ? detail
        : "Der externe Kioskplan konnte nicht verarbeitet werden.",
    );
  }
  return (await response.json()) as T;
}

function basePath(org: string) {
  return `/api/admin/${encodeURIComponent(org)}/external-kiosk-plans`;
}

export function loadExternalPlanComparison(org: string): Promise<ExternalPlanComparison | null> {
  return request<WireComparison | null>(`${basePath(org)}/latest/comparison`).then(toComparison);
}

export async function uploadExternalPlan(org: string, file: File): Promise<ExternalPlanComparison> {
  await ensureCsrfToken();
  const body = new FormData();
  body.append("file", file);
  const uploaded = await request<WireImport>(basePath(org), {
    method: "POST",
    headers: csrfHeaders(),
    body,
  });
  return toComparison(
    await request<WireComparison>(
      `${basePath(org)}/${encodeURIComponent(uploaded.batch.id)}/comparison`,
    ),
  )!;
}

export async function reviewExternalPlanRow(
  org: string,
  importId: string,
  rowId: string,
  reviewState: Exclude<ExternalReviewState, "OPEN">,
  note: string,
): Promise<Pick<ExternalPlanComparisonRow, "review_state" | "review_note">> {
  await ensureCsrfToken();
  const reviewed = await request<WireRow>(
    `${basePath(org)}/${encodeURIComponent(importId)}/comparison/${encodeURIComponent(rowId)}/review`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ review_state: reviewState, note: note || null }),
    },
  );
  return { review_state: reviewState, review_note: reviewed.review_note };
}

type WireBatch = { id: string; source_filename: string; uploaded_at: string };
type WireRow = {
  id: string;
  plan_date: string;
  start_time: string | null;
  end_time: string | null;
  category: "KIOSK" | "GRILL";
  assigned_person_text: string | null;
  source_note: string | null;
  raw_date: string;
  raw_time: string;
  review_state: "PENDING" | "ACKNOWLEDGED" | "OVERRIDDEN";
  review_note: string | null;
};
type WireProposal = NonNullable<ExternalPlanComparisonRow["proposal_window"]>;
type WireComparison = {
  batch: WireBatch;
  items: {
    proposal_window_id: string | null;
    proposal: WireProposal | null;
    external_row: WireRow | null;
    category: "KIOSK" | "GRILL";
    statuses: ExternalPlanStatus[];
  }[];
};
type WireImport = { batch: WireBatch; rows: WireRow[] };

function toComparison(value: WireComparison | null): ExternalPlanComparison | null {
  if (!value) return null;
  return {
    import_id: value.batch.id,
    filename: value.batch.source_filename,
    imported_at: value.batch.uploaded_at,
    rows: value.items.map((item, index) => ({
      id:
        item.external_row?.id ?? `${item.proposal_window_id ?? "extra"}-${item.category}-${index}`,
      proposal_window: item.proposal,
      external_entries: item.external_row
        ? [
            {
              id: item.external_row.id,
              date: item.external_row.plan_date,
              start_at: item.external_row.start_time,
              end_at: item.external_row.end_time,
              category: item.external_row.category,
              assigned_person_text: item.external_row.assigned_person_text,
              source_note: item.external_row.source_note,
              raw_text: [item.external_row.raw_date, item.external_row.raw_time]
                .filter(Boolean)
                .join(" · "),
            },
          ]
        : [],
      statuses: item.statuses,
      review_state:
        item.external_row?.review_state === "PENDING"
          ? "OPEN"
          : (item.external_row?.review_state ?? "OPEN"),
      review_note: item.external_row?.review_note ?? null,
    })),
  };
}
