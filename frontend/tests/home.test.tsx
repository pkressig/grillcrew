import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage (Platzhalter)", () => {
  it("zeigt den Produktnamen an", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "GrillCrew FCTC" })).toBeInTheDocument();
  });
});
