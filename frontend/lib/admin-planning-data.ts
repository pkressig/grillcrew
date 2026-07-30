import {
  loadEvents,
  loadPlanning,
  loadShifts,
  type PlanningEvent,
  type Shift,
} from "@/lib/planning";

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
  const eventLists = await Promise.all(
    planning.seasons.map((season) => loadEvents(org, season.id)),
  );
  const events = eventLists.flat();
  const eventGroups = await Promise.all(
    events.map(async (event) => ({ event, shifts: await loadShifts(org, event.id) })),
  );

  return {
    ...planning,
    events,
    shifts: eventGroups.flatMap(({ shifts }) => shifts),
    eventGroups,
  };
}
