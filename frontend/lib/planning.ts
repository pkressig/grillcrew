import { apiBaseUrl, csrfHeaders } from "@/lib/api";

export type PlanningStatus = "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
export type SeasonType = "AUTUMN" | "SPRING" | "OTHER";
export type ClubYear = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: PlanningStatus;
};
export type Season = {
  id: string;
  club_year_id: string;
  type: SeasonType;
  name: string;
  start_date: string;
  end_date: string;
  status: PlanningStatus;
};
export type ClubYearInput = Omit<ClubYear, "id">;
export type SeasonInput = Omit<Season, "id" | "club_year_id">;
export type EventStatus = "DRAFT" | "PUBLISHED" | "POSTPONED" | "CANCELLED" | "COMPLETED";
export type ShiftStatus = "OPEN" | "CLOSED" | "CANCELLED";
export type PlanningEvent = {
  id: string;
  season_id: string;
  title: string;
  date: string;
  location: string;
  event_type: string;
  public_description: string | null;
  internal_note: string | null;
  status: EventStatus;
  published_at: string | null;
};
export type Shift = {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
  public_note: string | null;
  internal_note: string | null;
  status: ShiftStatus;
  sort_order: number;
};
export type EventInput = Omit<PlanningEvent, "id" | "season_id" | "published_at">;
export type ShiftInput = Omit<Shift, "id" | "event_id">;

async function request<T>(
  path: string,
  init?: RequestInit,
  errorMessage = "Die Planungsdaten konnten nicht gespeichert werden.",
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error(errorMessage);
  return (await response.json()) as T;
}

function writeInit(method: "POST" | "PATCH", payload: object): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  };
}

export async function loadPlanning(org: string) {
  const base = `/api/admin/${encodeURIComponent(org)}`;
  const [clubYears, seasons, currentResponse] = await Promise.all([
    request<ClubYear[]>(
      `${base}/club-years`,
      undefined,
      "Die Vereinsjahre konnten nicht geladen werden.",
    ),
    request<Season[]>(`${base}/seasons`, undefined, "Die Saisons konnten nicht geladen werden."),
    fetch(`${apiBaseUrl}${base}/seasons/current`, { credentials: "include" }),
  ]);
  if (!currentResponse.ok && currentResponse.status !== 404)
    throw new Error("Die aktuelle Saison konnte nicht geladen werden.");
  const currentSeason = currentResponse.ok ? ((await currentResponse.json()) as Season) : null;
  return { clubYears, seasons, currentSeason };
}

export const createClubYear = (org: string, payload: ClubYearInput) =>
  request<ClubYear>(`/api/admin/${encodeURIComponent(org)}/club-years`, writeInit("POST", payload));
export const createSeason = (org: string, clubYearId: string, payload: SeasonInput) =>
  request<Season>(
    `/api/admin/${encodeURIComponent(org)}/club-years/${encodeURIComponent(clubYearId)}/seasons`,
    writeInit("POST", payload),
  );
export const updateSeasonStatus = (org: string, seasonId: string, status: PlanningStatus) =>
  request<Season>(
    `/api/admin/${encodeURIComponent(org)}/seasons/${encodeURIComponent(seasonId)}`,
    writeInit("PATCH", { status }),
  );

export const loadEvents = (org: string, seasonId: string) =>
  request<PlanningEvent[]>(
    `/api/admin/${encodeURIComponent(org)}/seasons/${encodeURIComponent(seasonId)}/events`,
    undefined,
    "Die Anlässe konnten nicht geladen werden.",
  );
export const createEvent = (org: string, seasonId: string, payload: EventInput) =>
  request<PlanningEvent>(
    `/api/admin/${encodeURIComponent(org)}/seasons/${encodeURIComponent(seasonId)}/events`,
    writeInit("POST", payload),
    "Der Anlass konnte nicht erstellt werden.",
  );
export const updateEventStatus = (org: string, eventId: string, status: EventStatus) =>
  request<PlanningEvent>(
    `/api/admin/${encodeURIComponent(org)}/events/${encodeURIComponent(eventId)}`,
    writeInit("PATCH", { status }),
    "Der Anlassstatus konnte nicht gespeichert werden.",
  );
export const loadShifts = (org: string, eventId: string) =>
  request<Shift[]>(
    `/api/admin/${encodeURIComponent(org)}/events/${encodeURIComponent(eventId)}/shifts`,
    undefined,
    "Die Einsätze konnten nicht geladen werden.",
  );
export const createShift = (org: string, eventId: string, payload: ShiftInput) =>
  request<Shift>(
    `/api/admin/${encodeURIComponent(org)}/events/${encodeURIComponent(eventId)}/shifts`,
    writeInit("POST", payload),
    "Der Einsatz konnte nicht erstellt werden.",
  );
export const updateShiftStatus = (org: string, shiftId: string, status: ShiftStatus) =>
  request<Shift>(
    `/api/admin/${encodeURIComponent(org)}/shifts/${encodeURIComponent(shiftId)}`,
    writeInit("PATCH", { status }),
    "Der Einsatzstatus konnte nicht gespeichert werden.",
  );
