import { checkEligibility } from "./eligibility.util";

const NG = { country: "Nigeria", age: 24, degree: "Bachelor's" };

describe("checkEligibility — country", () => {
  test("country mismatch blocks", () =>
    expect(
      checkEligibility({ countries: ["United States"] }, NG).eligible,
    ).toBe(false));

  test("country match passes (case/space-insensitive)", () =>
    expect(
      checkEligibility({ countries: ["nigeria", "Ghana"] }, NG).eligible,
    ).toBe(true));

  test("null countries fail-open", () =>
    expect(checkEligibility({ countries: null }, NG).eligible).toBe(true));

  test("empty countries array fail-open", () =>
    expect(checkEligibility({ countries: [] }, NG).eligible).toBe(true));

  test("legacy free-form fail-open", () =>
    expect(
      checkEligibility({ nationality: "US citizens only" }, NG).eligible,
    ).toBe(true));

  test("missing profile country fail-open", () =>
    expect(
      checkEligibility({ countries: ["United States"] }, { country: null })
        .eligible,
    ).toBe(true));

  test("unrestricted tokens fail-open", () =>
    expect(
      checkEligibility({ countries: ["International", "Worldwide"] }, NG)
        .eligible,
    ).toBe(true));

  test("blockers name the reason", () =>
    expect(
      checkEligibility({ countries: ["United States"] }, NG).blockers[0],
    ).toMatch(/United States/));
});

describe("checkEligibility — age", () => {
  test("age ceiling blocks", () =>
    expect(checkEligibility({ age_max: 22 }, NG).eligible).toBe(false));

  test("age within ceiling passes", () =>
    expect(checkEligibility({ age_max: 30 }, NG).eligible).toBe(true));

  test("age below minimum blocks", () =>
    expect(
      checkEligibility({ age_min: 30 }, { country: null, age: 24 }).eligible,
    ).toBe(false));

  test("age derived from dob when age missing", () =>
    expect(
      checkEligibility(
        { age_max: 22 },
        { country: null, dateOfBirth: "1990-01-01" },
      ).eligible,
    ).toBe(false));

  test("missing age and dob fail-open", () =>
    expect(checkEligibility({ age_max: 22 }, { country: null }).eligible).toBe(
      true,
    ));

  test("age blocker names the ceiling", () =>
    expect(checkEligibility({ age_max: 22 }, NG).blockers[0]).toMatch(
      /up to 22/,
    ));
});

describe("checkEligibility — degree", () => {
  test("graduate-only opportunity blocks an undergraduate", () =>
    expect(checkEligibility({ degree_levels: ["graduate"] }, NG).eligible).toBe(
      false,
    ));

  test("graduate opportunity passes a masters holder", () =>
    expect(
      checkEligibility(
        { degree_levels: ["graduate"] },
        { country: null, degree: "MSc Economics" },
      ).eligible,
    ).toBe(true));

  test("undergraduate opportunity passes a bachelor's holder", () =>
    expect(
      checkEligibility({ degree_levels: ["undergraduate"] }, NG).eligible,
    ).toBe(true));

  test("missing profile degree fail-open", () =>
    expect(
      checkEligibility({ degree_levels: ["graduate"] }, { country: null })
        .eligible,
    ).toBe(true));

  test("unbucketable degree_levels fail-open", () =>
    expect(
      checkEligibility({ degree_levels: ["astrophysics"] }, NG).eligible,
    ).toBe(true));

  test("degree blocker names the required level", () =>
    expect(
      checkEligibility({ degree_levels: ["graduate"] }, NG).blockers[0],
    ).toMatch(/graduate/));
});

describe("checkEligibility — defensive / malformed", () => {
  test("null eligibility fail-open", () =>
    expect(checkEligibility(null, NG).eligible).toBe(true));

  test("non-object eligibility fail-open", () =>
    expect(checkEligibility("US only", NG).eligible).toBe(true));

  test("array eligibility fail-open", () =>
    expect(checkEligibility(["US"], NG).eligible).toBe(true));

  test("garbage field types never throw and fail-open", () =>
    expect(
      checkEligibility({ countries: 42, age_max: "old", degree_levels: {} }, NG)
        .eligible,
    ).toBe(true));

  test("multiple blockers accumulate", () => {
    const verdict = checkEligibility(
      { countries: ["United States"], age_max: 22 },
      NG,
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.blockers.length).toBe(2);
  });
});
