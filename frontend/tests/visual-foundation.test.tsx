import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrganizationLogo } from "@/components/organization-logo";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { platformFallbackOrganization } from "@/lib/organization";

afterEach(cleanup);

describe("visual foundation primitives", () => {
  it("renders named button variants with disabled and focus states", () => {
    render(
      <div>
        <Button>Speichern</Button>
        <Button variant="secondary">Abbrechen</Button>
        <Button variant="destructive" disabled>
          Löschen
        </Button>
        <Button variant="ghost" size="sm">
          Details
        </Button>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Speichern" })).toHaveClass(
      "bg-primary",
      "focus-visible:ring-2",
    );
    expect(screen.getByRole("button", { name: "Abbrechen" })).toHaveClass("bg-background");
    expect(screen.getByRole("button", { name: "Löschen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Löschen" })).toHaveClass("bg-status-error");
    const ghost = screen.getByRole("button", { name: "Details" });
    ghost.focus();
    expect(ghost).toHaveFocus();
    expect(ghost).toHaveClass("bg-transparent", "text-sm");
  });

  it("keeps every status variant understandable through its visible label", () => {
    render(
      <div>
        <Badge variant="success">Anwesend</Badge>
        <Badge variant="warning">Kurzfristig abgesagt</Badge>
        <Badge variant="error">Nicht erschienen</Badge>
        <Badge variant="neutral">Noch offen</Badge>
      </div>,
    );

    expect(screen.getByText("Anwesend")).toHaveClass("text-status-success");
    expect(screen.getByText("Kurzfristig abgesagt")).toHaveClass("text-status-warning");
    expect(screen.getByText("Nicht erschienen")).toHaveClass("text-status-error");
    expect(screen.getByText("Noch offen")).toHaveClass("bg-status-neutral/10");
  });

  it("provides the shared card and page-header structure", () => {
    render(
      <>
        <PageHeader
          headingId="foundation-title"
          title="Visuelles Fundament"
          description="Gemeinsame Oberfläche"
          action={<Button>Neu</Button>}
        />
        <Card>
          <CardHeader>Kopf</CardHeader>
          <CardBody>Inhalt</CardBody>
        </Card>
      </>,
    );

    expect(screen.getByRole("heading", { name: "Visuelles Fundament" })).toHaveAttribute(
      "id",
      "foundation-title",
    );
    expect(screen.getByRole("button", { name: "Neu" })).toBeInTheDocument();
    expect(screen.getByText("Inhalt").parentElement).toHaveClass("shadow-card", "rounded-md");
  });
});

describe("organization logo", () => {
  it("renders an accessible monogram fallback from the organization short name", () => {
    render(<OrganizationLogo organization={platformFallbackOrganization} />);
    const fallback = screen.getByRole("img", { name: "Volunteer Platform Logo" });
    expect(fallback).toHaveTextContent("P");
    expect(fallback).toHaveClass("bg-primary", "border-secondary");
  });

  it("renders the configured organization logo with an accessible name", () => {
    render(
      <OrganizationLogo
        organization={{
          ...platformFallbackOrganization,
          name: "Example Org",
          theme: {
            ...platformFallbackOrganization.theme,
            logo_url: "https://assets.example.test/logo.svg",
          },
        }}
      />,
    );
    expect(screen.getByRole("img", { name: "Example Org Logo" })).toHaveAttribute(
      "src",
      "https://assets.example.test/logo.svg",
    );
  });
});
