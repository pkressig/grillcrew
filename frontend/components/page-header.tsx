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
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 id={headingId} className="text-2xl font-bold">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
