import { INTENT_PRESETS } from "./chat.service";

describe("INTENT_PRESETS", () => {
  it("maps every actionable intent to a non-empty instruction", () => {
    for (const key of [
      "fit_check",
      "next_move",
      "review_doc",
      "whats_missing",
    ] as const) {
      expect(INTENT_PRESETS[key]).toMatch(/\S/);
    }
  });

  it("free_chat adds no extra instruction", () => {
    expect(INTENT_PRESETS.free_chat).toBe("");
  });

  it("fit_check steers toward analyze_fit", () => {
    expect(INTENT_PRESETS.fit_check.toLowerCase()).toContain("analyze_fit");
  });

  it("whats_missing steers toward the application status", () => {
    expect(INTENT_PRESETS.whats_missing.toLowerCase()).toContain(
      "get_application_status",
    );
  });
});
