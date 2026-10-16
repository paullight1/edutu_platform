import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Opportunity } from "../types/opportunity";

const { fetchUserProfile, extractOnboardingState, fetchOpportunities } = vi.hoisted(() => ({
  fetchUserProfile: vi.fn(),
  extractOnboardingState: vi.fn(),
  fetchOpportunities: vi.fn(),
}));
vi.mock("./profile", () => ({ fetchUserProfile, extractOnboardingState }));
vi.mock("./opportunities", () => ({ fetchOpportunities }));

import {
  evaluateMatch,
  fetchPersonalizedOpportunities,
  type UserProfileForRecommendations,
} from "./personalizedRecommendations";

const profile: UserProfileForRecommendations = {
  id: "user-1",
  interests: [" "],
  careerGoals: [""],
  preferredCategories: [" "],
  experienceLevel: "beginner",
  availability: "flexible",
};

describe("personalized recommendations - trustworthy fit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not grant fit points for empty preference strings", () => {
    const result = evaluateMatch(profile, {
      id: "opp-1",
      title: "Open Fellowship",
      category: "Scholarship",
      description: "Study anywhere",
      benefits: [],
    } as Opportunity);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("does not assume a remote opportunity accepts applicants worldwide", () => {
    const result = evaluateMatch(
      { ...profile, location: "Nigeria", interests: [] },
      {
        id: "opp-2",
        title: "Remote Fellowship",
        category: "Fellowship",
        location: "Remote",
        benefits: [],
      } as Opportunity,
    );
    expect(result.reasons.map((item) => item.label))
      .toContain("Listed as remote; check location eligibility");
    expect(result.reasons.map((item) => item.label).join(" ")).not.toContain("anywhere");
  });

  it("keeps unpersonalized discovery available without fake 50-point scores", async () => {
    fetchUserProfile.mockResolvedValue({});
    extractOnboardingState.mockReturnValue(null);
    fetchOpportunities.mockResolvedValue([
      { id: "opp-1", title: "One" },
      { id: "opp-2", title: "Two" },
    ]);

    const matches = await fetchPersonalizedOpportunities("user-1", { limit: 1 });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchScore).toBe(0);
    expect(fetchOpportunities).toHaveBeenCalledWith({
      force: false,
      userId: "user-1",
    });
  });
});
