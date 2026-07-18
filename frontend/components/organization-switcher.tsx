import Link from "next/link";
import type { AuthMembership } from "@/lib/auth";

export function OrganizationSwitcher({
  memberships,
  currentSlug,
}: Readonly<{ memberships: AuthMembership[]; currentSlug: string }>) {
  return (
    <nav aria-label="Organisation wechseln">
      <p className="mb-2 text-sm font-medium">Organisationen</p>
      <ul className="flex flex-wrap gap-2">
        {memberships.map((membership) => {
          const isCurrent = membership.organization_slug === currentSlug;
          return (
            <li key={membership.organization_id}>
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded border px-3 text-sm ${
                  isCurrent
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "bg-background hover:bg-muted"
                }`}
                href={"/" + membership.organization_slug + "/admin"}
              >
                {membership.organization_name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
