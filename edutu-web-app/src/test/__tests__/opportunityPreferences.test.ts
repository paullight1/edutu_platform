import { describe, expect, it } from "vitest";
import { deriveOpportunityPreferences } from "../../services/opportunityPreferences";

describe("deriveOpportunityPreferences", () => {
  it("maps profile interests to canonical category labels", () => {
    const derived = deriveOpportunityPreferences({
      interests: ["Scholarships", "Internships", "Conferences", "Research"],
    });
    expect(derived.preferredCategories).toEqual(
      expect.arrayContaining([
        "Scholarships",
        "Internships",
        "Events",
        "Grants",
      ]),
    );
    expect(derived.preferredRegions).toBeUndefined();
  });

  it("maps onboarding goals, including custom free-text values", () => {
    const derived = deriveOpportunityPreferences({
      careerGoals: ["Win a scholarship", "Land my first job", "hackathons"],
    });
    expect(derived.preferredCategories).toEqual(
      expect.arrayContaining(["Scholarships", "Jobs", "Competitions"]),
    );
  });

  it("dedupes categories across interests and goals", () => {
    const derived = deriveOpportunityPreferences({
      interests: ["Scholarships"],
      careerGoals: ["Win a scholarship"],
    });
    expect(derived.preferredCategories).toEqual(["Scholarships"]);
  });

  it("passes interested countries through as preferred regions", () => {
    const derived = deriveOpportunityPreferences({
      interestedCountries: ["Canada", "", "Japan"],
    });
    expect(derived.preferredRegions).toEqual(["Canada", "Japan"]);
  });

  it("omits keys whose sources were not provided (merge-PATCH safety)", () => {
    expect(deriveOpportunityPreferences({})).toEqual({});
    expect(
      deriveOpportunityPreferences({ interestedCountries: [] }),
    ).toEqual({ preferredRegions: [] });
  });

  it("ignores unmappable topical interests without failing", () => {
    const derived = deriveOpportunityPreferences({
      interests: ["AI & Machine Learning", "Design"],
    });
    expect(derived.preferredCategories).toEqual([]);
  });
});
