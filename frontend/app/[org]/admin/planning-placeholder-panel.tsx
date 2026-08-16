import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import type { PlanningSection } from "./admin-shell";

const content = {
  kiosk: {
    title: "Kiosk",
    description: "Eigener Planungsbereich für feste Kiosk-Zuteilungen.",
    message:
      "Der Kioskplan ist eine separate Quelle. Die Koordination hat diese Quelldaten noch nicht bereitgestellt; deshalb werden hier keine Einsätze oder Zuteilungen erfunden.",
  },
  grill: {
    title: "Grill",
    description: "Eigener Planungsbereich für Grill-Einsätze.",
    message:
      "Der Grillplan ist eine separate Quelle. Die Koordination hat diese Quelldaten noch nicht bereitgestellt; deshalb werden hier keine Einsätze oder Zuteilungen erfunden.",
  },
} as const;

export function PlanningPlaceholderPanel({
  section,
}: Readonly<{
  section: Exclude<PlanningSection, "schedule" | "periods" | "archive" | "matchdays">;
}>) {
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
