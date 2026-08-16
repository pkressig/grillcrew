import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

describe("HomePage", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("renders the platform-neutral hero heading and wordmark", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Helfer-Einsatzplanung für Vereine — einfach, fair, mobil",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("GrillCrew")).toBeInTheDocument();
  });

  it("renders the Kernvorteile section with all four benefit cards", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 2, name: "Kernvorteile" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Eigener Bereich pro Verein" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Mobile-first für alle Altersgruppen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Faire, nachvollziehbare Vergütung" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Familien- und Kinderzuordnung" }),
    ).toBeInTheDocument();
  });

  it("renders the three-step 'So einfach geht's' section", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 2, name: "So einfach geht's" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Verein richtet seinen Bereich ein" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Helfer registrieren sich" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Schichten werden online verwaltet" }),
    ).toBeInTheDocument();
  });

  it("renders the contact section instead of a self-signup form", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Interesse für deinen Verein?" }),
    ).toBeInTheDocument();
    // No self-service organization signup exists yet, so there must be no form on this page.
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("exposes the CTA links with sensible accessible names and safe placeholder mailto targets", () => {
    render(<HomePage />);
    const heroContact = screen.getByRole("link", { name: "Kontakt aufnehmen" });
    expect(heroContact).toHaveAttribute("href", "mailto:hallo@DEINE-DOMAIN");

    const learnMore = screen.getByRole("link", { name: "So funktioniert's" });
    expect(learnMore).toHaveAttribute("href", "#so-einfach-gehts");

    const finalContact = screen.getByRole("link", { name: "Jetzt Kontakt aufnehmen" });
    expect(finalContact).toHaveAttribute("href", "mailto:hallo@DEINE-DOMAIN");
  });
});
