import type { ReactNode } from "react";

export function StatSummary({
  icon,
  label,
  value,
}: Readonly<{ icon: ReactNode; label: string; value: number }>) {
  return (
    <div className="rounded-md border bg-background p-5 shadow-card">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center justify-between gap-4 text-3xl font-bold">
        {value}
        <span className="text-primary">{icon}</span>
      </dd>
    </div>
  );
}
