import { createTitleFingerprint } from "./scraper-title-fingerprint";

describe("createTitleFingerprint", () => {
  it("normalizes title whitespace and excludes the source", () => {
    expect(
      createTitleFingerprint("  Global   Scholarship  ", "2026-11-05"),
    ).toBe("global scholarship|2026-11-05");
  });

  it("uses an empty deadline segment when the deadline is unknown", () => {
    expect(createTitleFingerprint("Global Scholarship", null)).toBe(
      "global scholarship|",
    );
  });
});
