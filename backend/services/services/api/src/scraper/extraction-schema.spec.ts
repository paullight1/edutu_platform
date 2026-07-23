import { DeepSeekExtractionSchema } from "./scraper.service";

describe("DeepSeekExtractionSchema — structured eligibility, fee, red flags", () => {
  it("round-trips a fully structured eligibility + application_fee + red_flags payload", () => {
    const payload = {
      summary: "A fully-funded scholarship for African graduate students.",
      description:
        "This program funds graduate study for students from selected countries.",
      requirements: ["Bachelor's degree"],
      benefits: ["Full tuition"],
      deadline: "2026-12-01",
      application_process: ["Submit online form"],
      eligibility: {
        countries: ["Nigeria", "Kenya"],
        age_min: 18,
        age_max: 30,
        degree_levels: ["undergraduate", "graduate"],
        gender: "female",
      },
      application_fee: {
        is_free: false,
        amount: 50,
        currency: "USD",
      },
      red_flags: ["fee required to apply"],
      funding_type: "scholarship",
      target_region: "Africa",
      confidence: 0.9,
      notes: [],
    };

    const parsed = DeepSeekExtractionSchema.parse(payload);

    expect(parsed.eligibility).toEqual({
      countries: ["Nigeria", "Kenya"],
      age_min: 18,
      age_max: 30,
      degree_levels: ["undergraduate", "graduate"],
      gender: "female",
    });
    expect(parsed.application_fee).toEqual({
      is_free: false,
      amount: 50,
      currency: "USD",
    });
    expect(parsed.red_flags).toEqual(["fee required to apply"]);
  });

  it("accepts null structured eligibility fields and a null application_fee", () => {
    const parsed = DeepSeekExtractionSchema.parse({
      summary: "Open to all.",
      description: "An opportunity open to everyone worldwide.",
      eligibility: {
        countries: null,
        age_min: null,
        age_max: null,
        degree_levels: null,
        gender: null,
      },
      application_fee: null,
      red_flags: [],
    });

    expect(parsed.eligibility).toEqual({
      countries: null,
      age_min: null,
      age_max: null,
      degree_levels: null,
      gender: null,
    });
    expect(parsed.application_fee).toBeNull();
    expect(parsed.red_flags).toEqual([]);
  });

  it("preserves legacy {level, nationality, field}-only eligibility payloads via passthrough", () => {
    const parsed = DeepSeekExtractionSchema.parse({
      summary: "Legacy shaped payload.",
      description: "A payload using only the old free-form eligibility keys.",
      eligibility: {
        level: "graduate",
        nationality: "Nigerian",
        field: "Engineering",
      },
    });

    expect(parsed.eligibility).toEqual({
      level: "graduate",
      nationality: "Nigerian",
      field: "Engineering",
    });
    // Fee/flags default to safe empties when omitted.
    expect(parsed.application_fee).toBeUndefined();
    expect(parsed.red_flags).toEqual([]);
  });

  it("defaults red_flags to an empty array when the field is absent", () => {
    const parsed = DeepSeekExtractionSchema.parse({
      summary: "No flags field at all.",
      description: "A minimal payload that omits red_flags entirely.",
    });

    expect(parsed.red_flags).toEqual([]);
  });
});
