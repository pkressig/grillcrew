import { apiBaseUrl, csrfHeaders, ensureCsrfToken } from "@/lib/api";

export type ProposalOverrideState = "PROPOSAL" | "MANUAL";

export type ProposalGame = {
  title: string;
  kickoff_at: string;
  venue: string;
};

export type ProposalWindow = {
  id: string;
  date: string;
  start_at: string;
  end_at: string;
  kiosk_open: boolean;
  grill_required: boolean;
  proposed_grill_slots: number;
  override_state: ProposalOverrideState;
  is_overridden?: boolean;
  split_reason: string | null;
  venues: string[];
  crew_rule_context: string | null;
  covered_event_ids?: string[];
  games: ProposalGame[];
};

export type PlanningProposalWindow = ProposalWindow;
export type PlanningProposalResponse = { windows: ProposalWindow[] };

export type ProposalOverrideInput = Partial<
  Pick<ProposalWindow, "kiosk_open" | "grill_required" | "proposed_grill_slots">
> & {
  starts_at?: string;
  ends_at?: string;
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

export function loadPlanningProposals(org: string): Promise<PlanningProposalResponse> {
  return request<PlanningProposalResponse>(proposalPath(org));
}

export async function refreshPlanningProposals(org: string): Promise<PlanningProposalResponse> {
  await ensureCsrfToken();
  return request<PlanningProposalResponse>(`${proposalPath(org)}/refresh`, {
    method: "POST",
    headers: csrfHeaders(),
  });
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
