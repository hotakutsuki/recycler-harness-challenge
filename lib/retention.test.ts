import { describe, expect, it } from "vitest";
import { expired } from "./retention";

const sheet = (over: Partial<Parameters<typeof expired>[0][number]> = {}) => ({
  id: "s1",
  photoPath: "a.jpg",
  committedAt: new Date("2026-06-01T00:00:00Z"),
  photoDeletedAt: null,
  ...over,
});

const NOW = new Date("2026-09-21T00:00:00Z"); // 112 days after 1 June

describe("what falls outside the retention window", () => {
  it("takes a photo past the window", () => {
    expect(expired([sheet()], 90, NOW).map((s) => s.id)).toEqual(["s1"]);
  });

  it("leaves one still inside it", () => {
    expect(expired([sheet()], 120, NOW)).toEqual([]);
  });

  it("never touches a sheet that has not been committed", () => {
    // The photo is the only way to check what the model read, so a document
    // still waiting for a person keeps it regardless of age.
    expect(expired([sheet({ committedAt: null })], 90, NOW)).toEqual([]);
  });

  it("skips one whose photo is already gone", () => {
    expect(expired([sheet({ photoDeletedAt: new Date() })], 90, NOW)).toEqual([]);
  });

  it("reports the age, so a dry run is readable", () => {
    expect(expired([sheet()], 90, NOW)[0]?.ageDays).toBe(112);
  });
});
