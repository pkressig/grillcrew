import { Badge } from "@/components/ui/badge";

export type GameDayListItem = {
  id: string;
  title: string;
  matchDescription?: string | null;
  startsAt: string | null;
  type?: string | null;
};

export function GameDayList({
  games,
  timezone,
  heading = "Spiele an diesem Tag",
}: Readonly<{ games: GameDayListItem[]; timezone: string; heading?: string }>) {
  const sortedGames = [...games].sort((a, b) => {
    if (a.startsAt === b.startsAt) return a.title.localeCompare(b.title, "de-CH");
    if (a.startsAt === null) return 1;
    if (b.startsAt === null) return -1;
    return a.startsAt.localeCompare(b.startsAt);
  });

  return (
    <section aria-label={heading}>
      <h3 className="text-sm font-semibold text-muted-foreground">{heading}</h3>
      <ul className="mt-2 grid gap-2">
        {sortedGames.map((game) => (
          <li key={game.id} className="flex items-start gap-3 rounded-md bg-muted p-3 text-sm">
            <span className="min-w-12 shrink-0 font-semibold tabular-nums">
              {game.startsAt ? (
                <time dateTime={game.startsAt}>{formatTime(game.startsAt, timezone)}</time>
              ) : (
                <span className="text-muted-foreground">Zeit nicht angegeben</span>
              )}
            </span>
            <span className="min-w-0 flex-1 font-medium">
              {game.title}
              {game.matchDescription ? ` – ${game.matchDescription}` : null}
            </span>
            {game.type ? <Badge variant="neutral">{game.type}</Badge> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatTime(value: string, timezone: string): string {
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Zeit nicht angegeben";
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date);
}
