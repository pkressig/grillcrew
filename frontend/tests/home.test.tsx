import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrganizationProvider } from "@/components/organization-provider";
import { platformFallbackOrganization } from "@/lib/organization";
import { OrganizationLanding } from "@/app/organization-landing";

describe("OrganizationLanding", () => {
  it("renders organization branding from context", () => {
    render(
      <OrganizationProvider
        organization={{
          ...platformFallbackOrganization,
          name: "Example Organization",
          slug: "example-organization",
          theme: {
            name: "Example Theme",
            logo_url: null,
            primary_color: "#111111",
            secondary_color: "#eeeeee",
          },
        }}
      >
        <OrganizationLanding />
      </OrganizationProvider>,
    );

    expect(screen.getByRole("heading", { name: "Example Organization" })).toBeInTheDocument();
    expect(screen.getByText("example-organization")).toBeInTheDocument();
  });
});
