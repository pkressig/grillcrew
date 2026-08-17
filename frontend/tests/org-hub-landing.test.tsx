import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformFallbackOrganization } from "@/lib/organization";

const { fetchPublicOrganizationStrict } = vi.hoisted(() => ({
  fetchPublicOrganizationStrict: vi.fn(),
}));
vi.mock("@/lib/organization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/organization")>()),
  fetchPublicOrganizationStrict,
}));

import OrganizationHubPage from "@/app/[org]/page";

const baseOrganization = {
  ...platformFallbackOrganization,
  name: "FC Thusis-Cazis",
  slug: "thusis-cazis",
};

async function renderPage(organization = baseOrganization) {
  fetchPublicOrganizationStrict.mockResolvedValue(organization);
  const element = await OrganizationHubPage({
    params: Promise.resolve({ org: organization.slug }),
  });
  render(element);
  return organization;
}

describe("OrganizationHubPage (recruitment landing)", () => {
  beforeEach(() => {
    fetchPublicOrganizationStrict.mockReset();
    vi.unstubAllGlobals();
  });
  afterEach(cleanup);

  it("renders the club name and logo", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Werde Helfer bei FC Thusis-Cazis" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "FC Thusis-Cazis Logo" })).toBeInTheDocument();
  });

  it("links both hero CTAs to the org's grill and kiosk plans", async () => {
    await renderPage();
    const grillLinks = screen.getAllByRole("link", { name: "Grill-Einsätze ansehen" });
    const kioskLinks = screen.getAllByRole("link", { name: "Kiosk-Einsätze ansehen" });
    expect(grillLinks.length).toBeGreaterThan(0);
    expect(kioskLinks.length).toBeGreaterThan(0);
    for (const link of grillLinks) expect(link).toHaveAttribute("href", "/thusis-cazis/grill");
    for (const link of kioskLinks) expect(link).toHaveAttribute("href", "/thusis-cazis/kiosk");
  });

  it("renders the interest form with all fields and a hidden honeypot input", async () => {
    await renderPage();
    expect(screen.getByLabelText("Vorname")).toBeInTheDocument();
    expect(screen.getByLabelText("Nachname")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefon oder E-Mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Interessensbereich (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Nachricht (optional)")).toBeInTheDocument();

    const honeypot = screen.getByLabelText("Website");
    expect(honeypot).toHaveAttribute("name", "website");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot.closest("div")).toHaveAttribute("aria-hidden", "true");
  });

  it("submits the interest form successfully and shows a confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await renderPage();

    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText("Telefon oder E-Mail"), {
      target: { value: "mia@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Interesse senden" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/public/thusis-cazis/volunteer-interest");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      first_name: "Mia",
      last_name: "Muster",
      contact: "mia@example.test",
      area: "EITHER",
      website: "",
    });
    expect(typeof body.form_started_at).toBe("string");
    expect(new Date(body.form_started_at as string).getTime()).not.toBeNaN();
    expect(await screen.findByRole("status")).toHaveTextContent("Danke für dein Interesse!");
  });

  it("renders the WhatsApp/call contact block when a coordination phone is configured", async () => {
    await renderPage({
      ...baseOrganization,
      settings: {
        ...baseOrganization.settings,
        coordination_contact_label: "Anna",
        coordination_contact_phone: "079 123 45 67",
      },
    });
    expect(screen.getByRole("link", { name: /WhatsApp senden/ })).toHaveAttribute(
      "href",
      expect.stringContaining("wa.me"),
    );
    expect(screen.getByRole("link", { name: /Anrufen/ })).toHaveAttribute(
      "href",
      expect.stringContaining("tel:"),
    );
  });

  it("falls back to generic copy when no coordination phone is configured", async () => {
    await renderPage();
    expect(screen.queryByRole("link", { name: /WhatsApp senden/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Anrufen/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Registriere dich und wähle eine Schicht/)).toBeInTheDocument();
  });
});
