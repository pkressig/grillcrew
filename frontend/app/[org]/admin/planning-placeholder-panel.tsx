import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import type { PlanningSection } from "./admin-shell";

const content = {
  kiosk: {
    title: "Kiosk",
    description: "Eigener Planungsbereich für feste Kiosk-Zuteilungen.",
    message:
      "Die Kiosk-Planung ist vorgesehen, aber noch nicht umgesetzt. Hier werden noch keine Einsätze oder Zuteilungen angezeigt.",
  },
  grill: {
    title: "Grill",
    description: "Eigener Planungsbereich für Grill-Einsätze.",
    message:
      "Die separate Grill-Planung ist vorgesehen, aber noch nicht umgesetzt. Grill-Einsätze werden weiterhin im Spielplan verwaltet.",
  },
} as const;

export function PlanningPlaceholderPanel({
  section,
}: Readonly<{ section: Exclude<PlanningSection, "schedule" | "periods"> }>) {
  const panel = content[section];
  return (
    <section className="grid gap-6" aria-labelledby={`${section}-title`}>
      <PageHeader
        headingId={`${section}-title`}
        title={panel.title}
        description={panel.description}
      />
      <Card role="status">
        <CardBody>
          <h2 className="text-lg font-semibold">Geplanter Funktionsumfang</h2>
          <p className="mt-2 text-muted-foreground">{panel.message}</p>
        </CardBody>
      </Card>
    </section>
  );
}
