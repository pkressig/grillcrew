import { apiBaseUrl, csrfHeaders, ensureCsrfToken } from "@/lib/api";

export type ProposalOverrideState = "PROPOSAL" | "MANUAL";

export type ProposalGame = {
  title: string;
  kickoff_at: string;
  venue: string;
};

export type ProposalGrillShiftSplit = {
  id: string;
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
};

export type ProposalWindow = {
  id: string;
  date: string;
  start_at: string;
  end_at: string;
  kiosk_open: boolean;
  grill_required: boolean;
  proposed_grill_slots: number;
  proposed_kiosk_slots?: number;
  override_state: ProposalOverrideState;
  is_overridden?: boolean;
  split_reason: string | null;
  venues: string[];
  crew_rule_context: string | null;
  covered_event_ids?: string[];
  games: ProposalGame[];
  kiosk_confirmed?: boolean;
  grill_confirmed?: boolean;
  grill_shift_splits?: ProposalGrillShiftSplit[];
  kiosk_shift_splits?: ProposalGrillShiftSplit[];
  /** Lifecycle fields are optional for backwards-compatible proposal responses. */
  status?: "DRAFT" | "CONFIRMED";
};

export type PlanningProposalWindow = ProposalWindow;
export type PlanningProposalResponse = { windows: ProposalWindow[] };

export type ProposalOverrideInput = Partial<
  Pick<
    ProposalWindow,
    "kiosk_open" | "grill_required" | "proposed_grill_slots" | "proposed_kiosk_slots"
  >
> & {
  starts_at?: string;
  ends_at?: string;
};

/**
 * The confirm endpoint never reads a request body: the shift/slot counts it
 * materialises always come from the already-persisted proposal override, so
 * callers must PATCH any edits before confirming rather than passing them here.
 */
export type ProposalConfirmationInput = {
  kind?: "kiosk" | "grill";
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Use the stable German fallback for non-JSON intermediary responses.
    }
    throw new Error(detail ?? "Die PlanungsvorschlÃ¤ge konnten nicht geladen werden.");
  }
  return (await response.json()) as T;
}

function proposalPath(org: string): string {
  return `/api/admin/${encodeURIComponent(org)}/proposals`;
}

export function loadPlanningProposals(
  org: string,
  includePast = false,
): Promise<PlanningProposalResponse> {
  return request<PlanningProposalResponse>(
    `${proposalPath(org)}${includePast ? "?include_past=true" : ""}`,
  );
}

export async function refreshPlanningProposals(
  org: string,
  includePast = false,
): Promise<PlanningProposalResponse> {
  await ensureCsrfToken();
  return request<PlanningProposalResponse>(
    `${proposalPath(org)}/refresh${includePast ? "?include_past=true" : ""}`,
    {
      method: "POST",
      headers: csrfHeaders(),
    },
  );
}

export async function updatePlanningProposal(
  org: string,
  id: string,
  payload: ProposalOverrideInput,
): Promise<ProposalWindow> {
  await ensureCsrfToken();
  return request<ProposalWindow>(`${proposalPath(org)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
}

export type ProposalGrillShiftSplitInput = {
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
};

/** Full replacement of a window's admin-defined grill sub-shifts (empty clears them). */
export async function updateGrillShiftSplits(
  org: string,
  id: string,
  shifts: ProposalGrillShiftSplitInput[],
): Promise<ProposalWindow> {
  await ensureCsrfToken();
  return request<ProposalWindow>(`${proposalPath(org)}/${encodeURIComponent(id)}/grill-shifts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ shifts }),
  });
}

/** Full replacement of a window's admin-defined Kiosk sub-shifts (empty clears them). */
export async function updateKioskShiftSplits(
  org: string,
  id: string,
  shifts: ProposalGrillShiftSplitInput[],
): Promise<ProposalWindow> {
  await ensureCsrfToken();
  return request<ProposalWindow>(`${proposalPath(org)}/${encodeURIComponent(id)}/kiosk-shifts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ shifts }),
  });
}

/** Confirm a proposal and materialise its configured draft shifts. */
export async function confirmPlanningProposal(
  org: string,
  id: string,
  payload: ProposalConfirmationInput = {},
): Promise<ProposalWindow> {
  await ensureCsrfToken();
  const kind = payload.kind ?? "kiosk";
  return request<ProposalWindow>(`${proposalPath(org)}/${encodeURIComponent(id)}/confirm/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
}
