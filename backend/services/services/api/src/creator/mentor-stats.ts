export interface MentorStatsInput {
  publishedRoadmaps: number;
  activeListings: number;
  roadmapEnrollments: number;
  listingEnrollments: number;
  totalCreditsEarned: number;
  walletBalance: number;
  ratingSum: number; // Σ(ratingAvg × ratingCount) across the mentor's roadmaps
  ratingCount: number; // Σ ratingCount
  mentorStatus: "approved" | "pending" | "rejected" | "none";
}

export interface MentorStats {
  publishedContent: number;
  learnersReached: number;
  creditsEarned: number;
  walletBalance: number;
  avgRating: number | null;
  ratingCount: number;
  mentorStatus: string;
}

export function computeMentorStats(input: MentorStatsInput): MentorStats {
  return {
    publishedContent: input.publishedRoadmaps + input.activeListings,
    learnersReached: input.roadmapEnrollments + input.listingEnrollments,
    creditsEarned: input.totalCreditsEarned,
    walletBalance: input.walletBalance,
    avgRating:
      input.ratingCount > 0
        ? Math.round((input.ratingSum / input.ratingCount) * 10) / 10
        : null,
    ratingCount: input.ratingCount,
    mentorStatus: input.mentorStatus,
  };
}
