import type { ReactNode } from "react";
import type { PublicOrganization } from "@/lib/organization";

export function AuthCard({
  organization,
  title,
  children,
}: Readonly<{ organization?: PublicOrganization; title: string; children: ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-8">
      <header className="flex items-center gap-3">
        {organization?.theme.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="h-12 w-12 rounded border object-contain"
            src={organization.theme.logo_url}
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-12 w-12 rounded border"
            style={
              organization
                ? {
                    backgroundColor: organization.theme.primary_color,
                    borderColor: organization.theme.secondary_color,
                  }
                : undefined
            }
          />
        )}
        <div>
          <p className="text-sm text-muted-foreground">
            {organization?.name ?? "Volunteer Platform"}
          </p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
      </header>
      <section className="rounded-lg border p-5">{children}</section>
    </main>
  );
}
