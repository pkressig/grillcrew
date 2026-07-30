import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Planning Calendar product decision", () => {
  it("documents the approved presentation-only loaded-week contract and non-goals", () => {
    const reference = readFileSync(
      resolve(process.cwd(), "../docs/UX_VISUAL_REFERENCE.md"),
      "utf8",
    );

    expect(reference).toContain(
      "Decision record: Planning Calendar presentation and loaded-week navigation",
    );
    expect(reference).toContain("**Date:** 2026-07-30");
    expect(reference).toContain("presentation-only Calendar view");
    expect(reference).toContain("already-loaded real events");
    expect(reference).toContain(
      "No backend date contract, recurrence, drag/drop, timezone changes, inferred unavailable dates",
    );
    expect(reference).not.toContain("### 8. Kalender — future");
  });
});
