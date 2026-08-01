import { apiBaseUrl, csrfHeaders } from "@/lib/api";
import type { PayoutStatus } from "@/lib/work-records";

export type CoordinationTimeRecord = {
  id: string;
  work_date: string;
  duration_minutes: number;
  hourly_rate_minor: number;
  payout_amount_minor: number;
  payout_status: PayoutStatus;
  note: string | null;
  signature_received_at: string | null;
  signature_received_by_user_id: string | null;
  signature_note: string | null;
  created_at: string;
  updated_at: string;
};

export type CoordinationTimeInput = Pick<
  CoordinationTimeRecord,
  "work_date" | "duration_minutes" | "hourly_rate_minor" | "note"
>;

const path = (org: string) => `/api/admin/${encodeURIComponent(org)}/coordination-time-records`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${url}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error("Die Koordinationszeit konnte nicht gespeichert werden.");
  return (await response.json()) as T;
}

const write = (method: "POST" | "PATCH", payload: object): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...csrfHeaders() },
  body: JSON.stringify(payload),
});

export const loadCoordinationTime = (org: string) => request<CoordinationTimeRecord[]>(path(org));
export const createCoordinationTime = (org: string, payload: CoordinationTimeInput) =>
  request<CoordinationTimeRecord>(path(org), write("POST", payload));
export const updateCoordinationTime = (org: string, id: string, payload: CoordinationTimeInput) =>
  request<CoordinationTimeRecord>(`${path(org)}/${id}`, write("PATCH", payload));
export const updateCoordinationTimeStatus = (
  org: string,
  id: string,
  payload: {
    payout_status: PayoutStatus;
    mark_signature_received: boolean;
    signature_note: string | null;
  },
) => request<CoordinationTimeRecord>(`${path(org)}/${id}/payout-status`, write("PATCH", payload));
