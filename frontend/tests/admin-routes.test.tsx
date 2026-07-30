import { describe, expect, it, vi } from "vitest";
import { platformFallbackOrganization } from "@/lib/organization";

const { fetchPublicOrganization } = vi.hoisted(() => ({ fetchPublicOrganization: vi.fn() }));
vi.mock("@/lib/organization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/organization")>()),
  fetchPublicOrganization,
}));

import AdminPage from "@/app/[org]/admin/page";

describe("admin routes", () => {
  it("composes the organization-scoped overview instead of redirecting", async () => {
    fetchPublicOrganization.mockResolvedValue(platformFallbackOrganization);
    const result = await AdminPage({ params: Promise.resolve({ org: "example" }) });
    expect(fetchPublicOrganization).toHaveBeenCalledWith("example");
    expect(result.props.organization).toBe(platformFallbackOrganization);
    expect(result.props.children.props).toMatchObject({
      activeView: "overview",
      org: "example",
      organization: platformFallbackOrganization,
    });
  });
});
