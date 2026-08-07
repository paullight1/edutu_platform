import { categorizeOpportunityTitle } from "./scraper-classification";

describe("categorizeOpportunityTitle", () => {
  it.each([
    ["Women in Software Engineering Scholarship", "Computer Science"],
    ["International Civil Engineering Fellowship", "Engineering"],
    ["MBA Entrepreneurship Competition", "Business"],
    ["Public Health Research Grant", "Medical"],
  ])("categorizes %s", (title, expected) => {
    expect(categorizeOpportunityTitle(title)).toBe(expected);
  });

  it("uses word boundaries for short keywords", () => {
    expect(
      categorizeOpportunityTitle("International training opportunity"),
    ).toBeNull();
    expect(categorizeOpportunityTitle("AI Fellowship")).toBe(
      "Computer Science",
    );
  });

  it("returns null when no trusted title signal exists", () => {
    expect(categorizeOpportunityTitle()).toBeNull();
    expect(categorizeOpportunityTitle("Global Leaders Programme")).toBeNull();
  });
});
