import type { ReactNode } from "react";

export function PageHeader({
  action,
  description,
  headingId,
  title,
}: Readonly<{
  action?: ReactNode;
  description: ReactNode;
  headingId?: string;
  title: ReactNode;
}>) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-5">
      <div>
        <h1 id={headingId} className="text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
