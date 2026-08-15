import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { PublicOrganization } from "@/lib/organization";
import { OrganizationLogo } from "@/components/organization-logo";
import { cn } from "@/lib/utils";

export function AuthCard({
  organization,
  title,
  children,
  embedded = false,
  back,
}: Readonly<{
  organization?: PublicOrganization;
  title: string;
  children: ReactNode;
  /**
   * Renders without the full-viewport centering wrapper, for use inside an
   * already-scrollable container such as a modal dialog.
   */
  embedded?: boolean;
  /** Optional back-navigation control rendered above the header. */
  back?: { label: string; onClick: () => void };
}>) {
  const Wrapper = embedded ? "div" : "main";
  return (
    <Wrapper
      className={cn(
        "flex w-full flex-col gap-5",
        embedded ? undefined : "mx-auto min-h-dvh max-w-md justify-center px-4 py-8",
      )}
    >
      {back ? (
        <button
          type="button"
          onClick={back.onClick}
          className="-ms-2 flex min-h-11 w-fit items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {back.label}
        </button>
      ) : null}
      <header className="flex items-center gap-3">
        {organization ? (
          <OrganizationLogo organization={organization} className="h-12 w-12 rounded border" />
        ) : (
          <div aria-hidden="true" className="h-12 w-12 rounded border" />
        )}
        <div>
          <p className="text-sm text-muted-foreground">
            {organization?.name ?? "Volunteer Platform"}
          </p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
      </header>
      <section className={cn("rounded-lg border", embedded ? "p-4" : "p-5")}>{children}</section>
    </Wrapper>
  );
}
