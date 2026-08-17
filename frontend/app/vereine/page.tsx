import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { fetchOrganizationDirectory, type OrganizationDirectoryEntry } from "@/lib/organization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vereine – Vereinshelden" };

export default async function OrganizationDirectoryPage() {
  const organizations = await fetchOrganizationDirectory();

  return (
    <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Vereine auf Vereinshelden</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Entdecke Vereine, die ihre Helfereinsätze über Vereinshelden organisieren, und finde deinen
        Verein.
      </p>
      {organizations.length === 0 ? (
        <p className="mt-8 text-muted-foreground">Aktuell sind noch keine Vereine gelistet.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Vereine">
          {organizations.map((organization) => (
            <li key={organization.slug}>
              <Link
                className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                href={`/${encodeURIComponent(organization.slug)}`}
              >
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardBody className="flex items-center gap-3">
                    <DirectoryLogo organization={organization} />
                    <span className="font-semibold">{organization.name}</span>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function DirectoryLogo({ organization }: Readonly<{ organization: OrganizationDirectoryEntry }>) {
  const label = `${organization.name} Logo`;
  if (organization.logo_url) {
    return (
      <Image
        alt={label}
        className="h-10 w-10 shrink-0 rounded-sm border object-contain"
        height={40}
        src={organization.logo_url}
        unoptimized
        width={40}
      />
    );
  }
  const monogram = (organization.short_name ?? organization.name).trim().charAt(0).toUpperCase();
  return (
    <span
      aria-label={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted font-bold"
      role="img"
    >
      {monogram || "?"}
    </span>
  );
}
