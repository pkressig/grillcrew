import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchPublicOrganizationStrict, redirectMock } = vi.hoisted(() => ({
  fetchPublicOrganizationStrict: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/organization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/organization")>()),
  fetchPublicOrganizationStrict,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import OrganizationHubPage, { generateMetadata as generateHubMetadata } from "@/app/[org]/page";
import OrganizationGrillPage, {
  generateMetadata as generateGrillMetadata,
} from "@/app/[org]/grill/page";
import OrganizationKioskPage, {
  generateMetadata as generateKioskMetadata,
} from "@/app/[org]/kiosk/page";
import OrganizationGrillHelpPage, {
  generateMetadata as generateGrillHelpMetadata,
} from "@/app/[org]/grill/hilfe/page";
import OrganizationKioskHelpPage, {
  generateMetadata as generateKioskHelpMetadata,
} from "@/app/[org]/kiosk/hilfe/page";

describe("organization landing pages redirect to /vereine for an unknown slug", () => {
  beforeEach(() => {
    fetchPublicOrganizationStrict.mockReset();
    redirectMock.mockClear();
  });

  const cases = [
    { name: "recruitment hub", Page: OrganizationHubPage, generateMetadata: generateHubMetadata },
    { name: "grill plan", Page: OrganizationGrillPage, generateMetadata: generateGrillMetadata },
    { name: "kiosk plan", Page: OrganizationKioskPage, generateMetadata: generateKioskMetadata },
    {
      name: "grill help",
      Page: OrganizationGrillHelpPage,
      generateMetadata: generateGrillHelpMetadata,
    },
    {
      name: "kiosk help",
      Page: OrganizationKioskHelpPage,
      generateMetadata: generateKioskHelpMetadata,
    },
  ] as const;

  for (const { name, Page, generateMetadata } of cases) {
    it(`redirects the ${name} page to /vereine when the org does not exist`, async () => {
      fetchPublicOrganizationStrict.mockResolvedValue(null);
      await expect(Page({ params: Promise.resolve({ org: "does-not-exist" }) })).rejects.toThrow(
        "NEXT_REDIRECT:/vereine",
      );
      expect(redirectMock).toHaveBeenCalledWith("/vereine");
    });

    it(`redirects the ${name} page's generateMetadata to /vereine when the org does not exist`, async () => {
      fetchPublicOrganizationStrict.mockResolvedValue(null);
      await expect(
        generateMetadata({ params: Promise.resolve({ org: "does-not-exist" }) }),
      ).rejects.toThrow("NEXT_REDIRECT:/vereine");
      expect(redirectMock).toHaveBeenCalledWith("/vereine");
    });
  }
});
