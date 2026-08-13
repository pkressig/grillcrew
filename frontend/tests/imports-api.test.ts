import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmImportBatch, uploadImportBatch } from "@/lib/imports";

afterEach(() => {
  vi.unstubAllGlobals();
});

function upload() {
  return uploadImportBatch("example", "club-year-1", new File(["test"], "spielplan.xlsx"));
}

describe("import API errors", () => {
  it("surfaces a backend detail string", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { detail: "Für dieses Vereinsjahr besteht bereits ein offener Import." },
            { status: 409 },
          ),
        ),
    );

    await expect(upload()).rejects.toThrow(
      "Für dieses Vereinsjahr besteht bereits ein offener Import.",
    );
  });

  it.each([{ message: "database error" }, ["validation error"], 42, null])(
    "does not surface a structured detail value: %j",
    async (detail) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail }, { status: 422 })));

      await expect(upload()).rejects.toThrow("Die Datei konnte nicht importiert werden.");
    },
  );

  it("uses the supplied fallback for malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 500 })));

    await expect(upload()).rejects.toThrow("Die Datei konnte nicht importiert werden.");
  });

  it("surfaces an honest, actionable message for a network error instead of the raw TypeError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    // A rejected fetch() means the request never reached the server at all (dropped
    // connection, CORS rejection, offline). This must not surface the raw browser
    // "Failed to fetch" message, nor the business-rule-flavored operation fallback
    // ("Der Import konnte nicht bestätigt werden.") — both would mislead the admin
    // about what actually happened and whether retrying is sensible.
    await expect(confirmImportBatch("example", "batch-1")).rejects.toThrow(
      "Die Verbindung zum Server ist fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.",
    );
  });
});
