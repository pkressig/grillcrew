import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalPlanComparisonWorkspace } from "@/app/[org]/admin/external-plan-comparison";
import * as externalPlan from "@/lib/external-kiosk-plan";
import type { ExternalPlanComparison, ExternalPlanComparisonRow } from "@/lib/external-kiosk-plan";

vi.mock("@/lib/external-kiosk-plan", () => ({
  loadExternalPlanComparison: vi.fn(),
  uploadExternalPlan: vi.fn(),
  reviewExternalPlanRow: vi.fn(),
}));

const row: ExternalPlanComparisonRow = {
  id: "row-1",
  proposal_window: {
    id: "proposal-1",
    date: "2026-04-11",
    start_at: "2026-04-11T08:30:00Z",
    end_at: "2026-04-11T12:30:00Z",
    kiosk_open: true,
    grill_required: true,
    games: [
      { title: "Junioren A – Gäste", kickoff_at: "2026-04-11T09:00:00Z", venue: "Sportplatz" },
    ],
  },
  external_entries: [
    {
      id: "entry-1",
      date: "2026-04-11",
      start_at: "2026-04-11T09:00:00Z",
      end_at: "2026-04-11T12:00:00Z",
      category: "KIOSK" as const,
      assigned_person_text: "Anna / Beat",
      source_note: "evtl. bis Schluss",
      raw_text: "09.00-12.00 Anna / Beat",
    },
  ],
  statuses: ["TIME_MISMATCH", "PERSON_ASSIGNMENT_PRESENT"],
  review_state: "OPEN" as const,
  review_note: null,
};
const comparison: ExternalPlanComparison = {
  import_id: "import-1",
  filename: "Kioskplan.xlsx",
  imported_at: "2026-04-01T10:00:00Z",
  rows: [row],
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(externalPlan.loadExternalPlanComparison).mockResolvedValue(comparison);
});

describe("external kiosk plan comparison", () => {
  it("renders the three comparison sections with source details and explicit status text", async () => {
    render(<ExternalPlanComparisonWorkspace org="club" timezone="Europe/Zurich" />);
    const workspace = await screen.findByLabelText("Planvergleich");
    expect(
      within(workspace).getByRole("region", { name: "Spielbetrieb-Vorschlag" }),
    ).toHaveTextContent("Kiosk offen · Grill erforderlich");
    expect(
      within(workspace).getByRole("region", { name: "Importierter Excelplan" }),
    ).toHaveTextContent("Anna / Beat");
    expect(
      within(workspace).getByRole("region", { name: "Importierter Excelplan" }),
    ).toHaveTextContent("evtl. bis Schluss");
    expect(
      within(workspace).getByRole("region", { name: "Unterschied und Status" }),
    ).toHaveTextContent("Zeitabweichung");
  });

  it("requires a note for and saves an explicit manual override", async () => {
    vi.mocked(externalPlan.reviewExternalPlanRow).mockResolvedValue({
      ...row,
      review_state: "OVERRIDDEN",
      review_note: "Koordination geprüft",
    });
    render(<ExternalPlanComparisonWorkspace org="club" timezone="Europe/Zurich" />);
    const override = await screen.findByRole("button", { name: "Manuell übersteuern" });
    expect(override).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Prüfnotiz"), {
      target: { value: "Koordination geprüft" },
    });
    fireEvent.click(override);
    await waitFor(() =>
      expect(externalPlan.reviewExternalPlanRow).toHaveBeenCalledWith(
        "club",
        "import-1",
        "row-1",
        "OVERRIDDEN",
        "Koordination geprüft",
      ),
    );
    expect(
      await screen.findByText("Abweichung wurde ausdrücklich manuell übersteuert."),
    ).toBeInTheDocument();
  });

  it("uploads an xlsx and explains that no operational records change", async () => {
    vi.mocked(externalPlan.loadExternalPlanComparison).mockResolvedValue(null);
    vi.mocked(externalPlan.uploadExternalPlan).mockResolvedValue(comparison);
    render(<ExternalPlanComparisonWorkspace org="club" timezone="Europe/Zurich" />);
    await screen.findByText("Noch kein externer Plan importiert");
    const file = new File(["xlsx"], "Kioskplan.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(screen.getByLabelText("Excelplan hochladen"), { target: { files: [file] } });
    expect(
      await screen.findByText(/Vorschläge und Einsätze wurden nicht verändert/),
    ).toBeInTheDocument();
    expect(externalPlan.uploadExternalPlan).toHaveBeenCalledWith("club", file);
  });
});
