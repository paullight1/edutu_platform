import { computeMentorStats } from "./mentor-stats";

const base = {
  publishedRoadmaps: 0,
  activeListings: 0,
  roadmapEnrollments: 0,
  listingEnrollments: 0,
  totalCreditsEarned: 0,
  walletBalance: 0,
  ratingSum: 0,
  ratingCount: 0,
  mentorStatus: "approved" as const,
};

describe("computeMentorStats", () => {
  it("sums published content and learners across roadmaps + listings", () => {
    const s = computeMentorStats({
      ...base,
      publishedRoadmaps: 3,
      activeListings: 2,
      roadmapEnrollments: 40,
      listingEnrollments: 10,
    });
    expect(s.publishedContent).toBe(5);
    expect(s.learnersReached).toBe(50);
  });
  it("computes a weighted average rating rounded to 1dp", () => {
    // two roadmaps: (4.0 x 3) + (5.0 x 1) = 17 over 4 ratings = 4.25 -> 4.3
    const s = computeMentorStats({ ...base, ratingSum: 17, ratingCount: 4 });
    expect(s.avgRating).toBe(4.3);
    expect(s.ratingCount).toBe(4);
  });
  it("returns null avgRating when there are no ratings", () => {
    expect(computeMentorStats(base).avgRating).toBeNull();
  });
  it("passes through earnings, wallet and status", () => {
    const s = computeMentorStats({
      ...base,
      totalCreditsEarned: 1200,
      walletBalance: 340,
      mentorStatus: "pending",
    });
    expect(s.creditsEarned).toBe(1200);
    expect(s.walletBalance).toBe(340);
    expect(s.mentorStatus).toBe("pending");
  });
});
