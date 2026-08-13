import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOneDriveConfig, saveOneDriveConfig, syncOneDriveNow } from "@/lib/onedrive-sync";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OneDrive sync API errors", () => {
  it("surfaces a backend detail string for a handled HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: "Ein Synchronisationslauf ist bereits aktiv." }, { status: 422 }),
        ),
    );

    await expect(syncOneDriveNow("example")).rejects.toThrow(
      "Ein Synchronisationslauf ist bereits aktiv.",
    );
  });

  it.each([
    ["loadOneDriveConfig", () => loadOneDriveConfig("example")],
    ["saveOneDriveConfig", () => saveOneDriveConfig("example", {} as never)],
    ["syncOneDriveNow", () => syncOneDriveNow("example")],
  ])(
    "surfaces an honest, actionable message for a network error instead of the raw TypeError (%s)",
    async (_name, call) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

      // Previously this rejected fetch() propagated straight to the UI unmodified —
      // "Failed to fetch" in Chrome, or an equivalent raw browser string in other
      // engines — instead of a translated, actionable message.
      await expect(call()).rejects.toThrow(
        "Die Verbindung zum Server ist fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.",
      );
    },
  );
});
