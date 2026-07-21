import { apiBaseUrl } from "@/lib/api";

export type PublicShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
  occupied_volunteers: number;
  public_note: string | null;
  status: "OPEN" | "CLOSED";
};

export type PublicPlanEvent = {
  id: string;
  title: string;
  date: string;
  location: string;
  event_type: string;
  public_description: string | null;
  shifts: PublicShift[];
};

export type PublicPlan = { events: PublicPlanEvent[] };

export async function fetchPublicPlan(org: string, signal?: AbortSignal): Promise<PublicPlan> {
  const response = await fetch(`${apiBaseUrl}/api/public/${encodeURIComponent(org)}/plan`, {
    signal,
  });
  if (!response.ok) throw new Error("Der Einsatzplan konnte nicht geladen werden.");
  return (await response.json()) as PublicPlan;
}
