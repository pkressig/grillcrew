import { apiBaseUrl, csrfHeaders } from "@/lib/api";

export type CompensationType = "WORK_HOURS" | "VOLUNTARY" | "PAYOUT";
export type PayoutStatus = "OPEN" | "APPROVED" | "PAID";

export type WorkRecord = {
  id: string;
  signup_id: string;
  volunteer_id: string;
  credited_family_member_id: string | null;
  compensation_type: CompensationType;
  duration_minutes: number | null;
  payout_rate_minor_per_hour: number | null;
  payout_amount_minor: number | null;
  payout_status: PayoutStatus | null;
  signature_received_at: string | null;
  signature_confirmed_by_user_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkRecordClassifyInput = {
  compensation_type: CompensationType;
  credited_family_member_id: string | null;
  duration_minutes: number | null;
  note: string | null;
};

export type PayoutStatusInput = {
  payout_status: PayoutStatus;
  mark_signature_received: boolean;
};

async function request<T>(path: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error(errorMessage ?? "Die Daten konnten nicht gespeichert werden.");
  return (await response.json()) as T;
}

function writeInit(payload: object): RequestInit {
  return {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  };
}

const workRecordPath = (org: string, signupId: string) =>
  `/api/admin/${encodeURIComponent(org)}/signups/${encodeURIComponent(signupId)}/work-record`;

export async function loadWorkRecord(org: string, signupId: string): Promise<WorkRecord | null> {
  const response = await fetch(`${apiBaseUrl}${workRecordPath(org, signupId)}`, {
    credentials: "include",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Die Zuordnung konnte nicht geladen werden.");
  return (await response.json()) as WorkRecord;
}

export const classifyWorkRecord = (
  org: string,
  signupId: string,
  payload: WorkRecordClassifyInput,
) =>
  request<WorkRecord>(
    workRecordPath(org, signupId),
    writeInit(payload),
    "Die Zuordnung konnte nicht gespeichert werden.",
  );

export const updateWorkRecordPayoutStatus = (
  org: string,
  signupId: string,
  payload: PayoutStatusInput,
) =>
  request<WorkRecord>(
    `${workRecordPath(org, signupId)}/payout-status`,
    writeInit(payload),
    "Der Auszahlungsstatus konnte nicht gespeichert werden.",
  );
