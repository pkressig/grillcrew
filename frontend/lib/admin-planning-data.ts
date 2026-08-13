import { loadEventsWithShifts, loadPlanning, type PlanningEvent, type Shift } from "@/lib/planning";

export type AdminEventWithShifts = {
  event: PlanningEvent;
  shifts: Shift[];
};

type PlanningData = Awaited<ReturnType<typeof loadPlanning>>;

export async function loadAdminPlanningData(
  org: string,
  onPlanningLoaded?: (planning: PlanningData) => void,
) {
  const planning = await loadPlanning(org);
  onPlanningLoaded?.(planning);
  // One request per season (typically 1-2), not one per event: with a season's worth
  // of imported games (~60), fetching each event's shifts as a separate round-trip
  // fired dozens of parallel requests on every admin page load, which is what made
  // the overview intermittently fail with "Failed to fetch" once a real schedule was
  // imported. The backend now returns events with their shifts already nested.
  const eventLists = await Promise.all(
    planning.seasons.map((season) => loadEventsWithShifts(org, season.id)),
  );
  const eventGroups: AdminEventWithShifts[] = eventLists
    .flat()
    .map(({ shifts, ...event }) => ({ event, shifts }));
  const events = eventGroups.map(({ event }) => event);

  return {
    ...planning,
    events,
    shifts: eventGroups.flatMap(({ shifts }) => shifts),
    eventGroups,
  };
}
