import {
  DEFAULT_CRISIS_CONTACT,
  SELF_HARM_SUPPORT,
  detectSelfHarmIntent,
  selfHarmSupportText,
} from "./crisis-support";

describe("selfHarmSupportText — admin-configurable crisis contact", () => {
  it("interpolates a provided number in English", () => {
    const text = selfHarmSupportText("en", "+15550009999");
    expect(text).toContain("+15550009999");
    expect(text).not.toContain("{{contact}}");
    expect(text).toContain("findahelpline.com");
  });

  it("interpolates a provided number in a non-Latin locale (Arabic)", () => {
    const text = selfHarmSupportText("ar", "+15550009999");
    expect(text).toContain("+15550009999");
    expect(text).not.toContain("{{contact}}");
    expect(text).toContain("findahelpline.com");
  });

  it("falls back to the default number when none is provided", () => {
    for (const locale of ["en", "ar", "zh"]) {
      const text = selfHarmSupportText(locale);
      expect(text).toContain(DEFAULT_CRISIS_CONTACT);
      expect(text).not.toContain("{{contact}}");
    }
  });

  it("falls back to the default number when an empty/whitespace value is passed", () => {
    expect(selfHarmSupportText("en", "")).toContain(DEFAULT_CRISIS_CONTACT);
    expect(selfHarmSupportText("en", "   ")).toContain(DEFAULT_CRISIS_CONTACT);
    expect(selfHarmSupportText("en", null)).toContain(DEFAULT_CRISIS_CONTACT);
  });

  it("SELF_HARM_SUPPORT equals the default-filled English message", () => {
    expect(SELF_HARM_SUPPORT).toBe(selfHarmSupportText("en"));
    expect(SELF_HARM_SUPPORT).toContain(DEFAULT_CRISIS_CONTACT);
    expect(SELF_HARM_SUPPORT).toContain("findahelpline.com");
  });
});

// Locks the safety-critical invariant: multilingual detection is a STRICT
// SUPERSET of the original English regex. Every English phrase the old inline
// gate caught must still be caught, and the 8 added locales are purely
// additive. Without this, a future edit to the patterns could silently narrow
// detection on a self-harm path and no other test would notice.
describe("detectSelfHarmIntent — strict superset", () => {
  // These are the phrasings the original English-only regex matched. They must
  // never stop matching.
  it.each([
    "I want to kill myself",
    "i am going to end my life",
    "i want to commit suicide",
    "i feel suicidal",
    "thinking about self-harm",
    "i keep hurting myself",
    "i just want to die",
  ])("still detects legacy English phrasing: %s", (phrase) => {
    expect(detectSelfHarmIntent(phrase)).toBe(true);
  });

  // The added locales are additive — at least one direct phrasing per non-en
  // locale is now caught where before it was not. (Detection runs every
  // locale's patterns against every message, so no locale tag is supplied.)
  it.each([
    ["fr", "je veux me suicider"],
    ["es", "quiero suicidarme"],
    ["pt", "quero me matar"],
    ["sw", "nataka kujiua"],
    ["ar", "أريد أن أنتحر"],
    ["hi", "मैं आत्महत्या करना चाहता हूँ"],
    ["zh", "我想自杀"],
  ])("now detects %s crisis phrasing", (_locale, phrase) => {
    expect(detectSelfHarmIntent(phrase)).toBe(true);
  });

  it("does not fire on ordinary study messages", () => {
    expect(detectSelfHarmIntent("I want to apply for this scholarship")).toBe(
      false,
    );
    expect(detectSelfHarmIntent("help me build a roadmap")).toBe(false);
  });
});
