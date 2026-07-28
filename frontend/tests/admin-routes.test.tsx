import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

import AdminPage from "@/app/[org]/admin/page";

describe("admin routes", () => {
  it("redirects the organization admin root to planning", async () => {
    await AdminPage({ params: Promise.resolve({ org: "example" }) });
    expect(redirect).toHaveBeenCalledWith("/example/admin/planning");
  });
});
