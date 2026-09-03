import { toEligibilityProfile } from "./eligibility-profile.util";

describe("toEligibilityProfile", () => {
  it("preserves explicit country, age, and degree fields", () => {
    expect(
      toEligibilityProfile({
        country: "Nigeria",
        age: 24,
        degree: "Bachelor's degree",
      }),
    ).toEqual({
      country: "Nigeria",
      age: 24,
      degree: "Bachelor's degree",
    });
  });

  it("derives age from a valid date of birth when age is absent", () => {
    expect(
      toEligibilityProfile(
        {
          country: "Ghana",
          dateOfBirth: "2000-09-03",
          education: [{ degree: "BSc" }],
        },
        new Date("2026-09-03T12:00:00Z"),
      ),
    ).toEqual({
      country: "Ghana",
      age: 26,
      degree: "BSc",
    });
  });

  it("uses nested location and education values used by recommendation requests", () => {
    expect(
      toEligibilityProfile({
        location: { country: "Kenya" },
        education: {
          degree: "Master of Science",
        },
      }),
    ).toEqual({
      country: "Kenya",
      age: undefined,
      degree: "Master of Science",
    });
  });

  it("fails soft on malformed profile values", () => {
    expect(
      toEligibilityProfile({
        country: 17,
        age: "not-a-number",
        dateOfBirth: "invalid",
        education: [],
      }),
    ).toEqual({
      country: undefined,
      age: undefined,
      degree: undefined,
    });
  });
});
