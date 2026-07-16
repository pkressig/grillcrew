"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicOrganization } from "@/lib/organization";

const OrganizationContext = createContext<PublicOrganization | null>(null);

export function OrganizationProvider({
  organization,
  children,
}: Readonly<{
  organization: PublicOrganization;
  children: ReactNode;
}>) {
  return (
    <OrganizationContext.Provider value={organization}>{children}</OrganizationContext.Provider>
  );
}

export function useOrganization(): PublicOrganization {
  const organization = useContext(OrganizationContext);
  if (organization === null) {
    throw new Error("useOrganization must be used within OrganizationProvider");
  }
  return organization;
}
