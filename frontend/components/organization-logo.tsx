import Image from "next/image";
import type { PublicOrganization } from "@/lib/organization";
import { cn } from "@/lib/utils";

export function OrganizationLogo({
  organization,
  className,
}: Readonly<{ organization: PublicOrganization; className?: string }>) {
  const label = `${organization.name} Logo`;
  if (organization.theme.logo_url) {
    return (
      <Image
        alt={label}
        className={cn("h-10 w-10 rounded-sm border object-contain", className)}
        height={40}
        src={organization.theme.logo_url}
        unoptimized
        width={40}
      />
    );
  }
  const monogram = (organization.short_name ?? organization.name).trim().charAt(0).toUpperCase();
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-secondary bg-primary font-bold text-primary-foreground",
        className,
      )}
      role="img"
    >
      {monogram || "?"}
    </span>
  );
}
