import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { platformFallbackOrganization } from "@/lib/organization";
import { HelpPage } from "@/app/[org]/help-page";

const organization = {
  ...platformFallbackOrganization,
  name: "FC Beispiel",
  slug: "fc-beispiel",
};

afterEach(cleanup);

describe("HelpPage", () => {
  it("renders Grill-specific wording and a link back to the Grill plan", () => {
    render(<HelpPage organization={organization} shiftType="GRILL" />);
    expect(
      screen.getByRole("heading", { name: "So trägst du dich für einen Grill-Einsatz ein" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Zum Grill-Einsatzplan von FC Beispiel" }),
    ).toHaveAttribute("href", "/fc-beispiel/grill");
    expect(screen.getByRole("link", { name: "Zurück zum Einsatzplan" })).toHaveAttribute(
      "href",
      "/fc-beispiel/grill",
    );
  });

  it("renders Kiosk-specific wording and a link back to the Kiosk plan", () => {
    render(<HelpPage organization={organization} shiftType="KIOSK" />);
    expect(
      screen.getByRole("heading", { name: "So trägst du dich für einen Kiosk-Einsatz ein" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Zum Kiosk-Einsatzplan von FC Beispiel" }),
    ).toHaveAttribute("href", "/fc-beispiel/kiosk");
  });

  it("expands an FAQ item to reveal its answer", () => {
    render(<HelpPage organization={organization} shiftType="GRILL" />);
    const item = screen.getByText("Muss ich mich registrieren?").closest("details")!;
    expect(item).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Muss ich mich registrieren?"));
    expect(item).toHaveAttribute("open");
  });

  it("does not render a contact section when no coordination phone is configured", () => {
    render(<HelpPage organization={organization} shiftType="GRILL" />);
    expect(screen.queryByRole("heading", { name: "Direkt Kontakt" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Deine Nachricht")).not.toBeInTheDocument();
  });

  it("lets a helper type a message and prepares it as a WhatsApp link", () => {
    render(
      <HelpPage
        organization={{
          ...organization,
          settings: {
            ...organization.settings,
            coordination_contact_label: "Pascal",
            coordination_contact_phone: "079 513 44 33",
          },
        }}
        shiftType="GRILL"
      />,
    );
    const textarea = screen.getByLabelText("Deine Nachricht");
    const whatsappLink = screen.getByRole("link", { name: "Über WhatsApp senden" });
    expect(whatsappLink).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/41795134433"),
    );
    expect(decodeURIComponent(whatsappLink.getAttribute("href")!)).toContain("Hallo Pascal");

    fireEvent.change(textarea, { target: { value: "Kann ich meine Schicht tauschen?" } });
    const updatedHref = decodeURIComponent(
      screen.getByRole("link", { name: "Über WhatsApp senden" }).getAttribute("href")!,
    );
    expect(updatedHref).toContain("Hallo Pascal, Kann ich meine Schicht tauschen?");

    expect(screen.getByRole("link", { name: "Anrufen" })).toHaveAttribute(
      "href",
      "tel:+41795134433",
    );
  });
});
