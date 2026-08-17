import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchOrganizationDirectory } = vi.hoisted(() => ({
  fetchOrganizationDirectory: vi.fn(),
}));
vi.mock("@/lib/organization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/organization")>()),
  fetchOrganizationDirectory,
}));

import OrganizationDirectoryPage from "@/app/vereine/page";

async function renderPage() {
  const element = await OrganizationDirectoryPage();
  render(element);
}

describe("OrganizationDirectoryPage", () => {
  beforeEach(() => {
    fetchOrganizationDirectory.mockReset();
  });
  afterEach(cleanup);

  it("renders every club with a working link to its recruitment hub", async () => {
    fetchOrganizationDirectory.mockResolvedValue([
      { slug: "fc-thusis-cazis", name: "FC Thusis-Cazis", short_name: "FCTC", logo_url: null },
      {
        slug: "sv-example",
        name: "SV Example",
        short_name: null,
        logo_url: "https://example.test/logo.png",
      },
    ]);
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Vereine auf Vereinshelden" }),
    ).toBeInTheDocument();
    const fctcLink = screen.getByRole("link", { name: /FC Thusis-Cazis/ });
    expect(fctcLink).toHaveAttribute("href", "/fc-thusis-cazis");
    const svLink = screen.getByRole("link", { name: /SV Example/ });
    expect(svLink).toHaveAttribute("href", "/sv-example");
  });

  it("shows an honest empty state when there are no clubs", async () => {
    fetchOrganizationDirectory.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText("Aktuell sind noch keine Vereine gelistet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Vereine" })).not.toBeInTheDocument();
  });
});
