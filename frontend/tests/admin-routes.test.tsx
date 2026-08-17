import { describe, expect, it, vi } from "vitest";
import { platformFallbackOrganization } from "@/lib/organization";

const { fetchPublicOrganization } = vi.hoisted(() => ({ fetchPublicOrganization: vi.fn() }));
vi.mock("@/lib/organization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/organization")>()),
  fetchPublicOrganization,
}));

import AdminPage from "@/app/[org]/admin/page";
import SettingsAdminPage from "@/app/[org]/admin/settings/page";
import WhatsAppAdminPage from "@/app/[org]/admin/whatsapp/page";
import KioskPlanningPage from "@/app/[org]/admin/planning/kiosk/page";
import PeriodPlanningPage from "@/app/[org]/admin/planning/periods/page";

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

  it("composes the organization-scoped settings view", async () => {
    fetchPublicOrganization.mockResolvedValue(platformFallbackOrganization);
    const result = await SettingsAdminPage({ params: Promise.resolve({ org: "example" }) });
    expect(fetchPublicOrganization).toHaveBeenCalledWith("example");
    expect(result.props.children.props).toMatchObject({
      activeView: "settings",
      org: "example",
      organization: platformFallbackOrganization,
    });
  });

  it("composes the organization-scoped WhatsApp view", async () => {
    fetchPublicOrganization.mockResolvedValue(platformFallbackOrganization);
    const result = await WhatsAppAdminPage({ params: Promise.resolve({ org: "example" }) });
    expect(fetchPublicOrganization).toHaveBeenCalledWith("example");
    expect(result.props.children.props).toMatchObject({
      activeView: "whatsapp",
      org: "example",
      organization: platformFallbackOrganization,
    });
  });

  it.each([
    [KioskPlanningPage, "kiosk"],
    [PeriodPlanningPage, "periods"],
  ] as const)("preserves the planning deep link for %s", async (Page, planningSection) => {
    fetchPublicOrganization.mockResolvedValue(platformFallbackOrganization);
    const result = await Page({ params: Promise.resolve({ org: "example" }) });
    expect(result.props.children.props).toMatchObject({
      activeView: "planning",
      planningSection,
      org: "example",
    });
  });
});
