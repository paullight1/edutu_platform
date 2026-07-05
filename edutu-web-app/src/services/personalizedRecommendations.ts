import type { AppUser } from '../types/user';
import type { Opportunity } from '../types/opportunity';
import type { OnboardingProfileData } from '../types/onboarding';
import { fetchUserProfile, extractOnboardingState } from './profile';
import { fetchOpportunities } from './opportunities';

/**
 * Represents user preferences and interests for personalized recommendations
 */
export interface UserProfileForRecommendations {
  id: string;
  name?: string;
  age?: number;
  courseOfStudy?: string;
  interests: string[];
  location?: string;
  careerGoals: string[];
  experienceLevel: string; // beginner, intermediate, advanced
  preferredCategories: string[];
  availability: string; // full-time, part-time, remote, flexible
  educationLevel?: string;
  preferredLearning?: string[];
}

/**
 * Converts AppUser to UserProfileForRecommendations format
 */
export function formatUserProfileForRecommendations(
  user: AppUser,
  additionalData?: Partial<UserProfileForRecommendations>,
  onboardingData?: Partial<UserProfileForRecommendations>
): UserProfileForRecommendations {
  return {
    id: user.id,
    name: user.name,
    age: user.age,
    courseOfStudy: user.courseOfStudy,
    interests: onboardingData?.interests || additionalData?.interests || [],
    location: onboardingData?.location || additionalData?.location || '',
    careerGoals: onboardingData?.careerGoals || additionalData?.careerGoals || [],
    experienceLevel: onboardingData?.experienceLevel || additionalData?.experienceLevel || 'intermediate',
    preferredCategories: onboardingData?.preferredCategories || additionalData?.preferredCategories || [],
    availability: onboardingData?.availability || additionalData?.availability || 'flexible',
    educationLevel: onboardingData?.educationLevel || additionalData?.educationLevel,
    preferredLearning: onboardingData?.preferredLearning || additionalData?.preferredLearning,
  };
}

/**
 * Converts OnboardingProfileData to UserProfileForRecommendations format
 */
export function onboardingToRecommendationProfile(
  userId: string,
  data: OnboardingProfileData
): UserProfileForRecommendations {
  // Map goals to career goals and derive categories from interests
  const careerGoals = data.goals || [];

  // Derive preferred categories from interests
  const categoryMap: Record<string, string[]> = {
    'Technology': ['Technology', 'Software', 'IT', 'Tech'],
    'Business': ['Business', 'Entrepreneurship', 'Startup'],
    'Health': ['Health', 'Medical', 'Healthcare'],
    'Education': ['Education', 'Teaching', 'Learning'],
    'Arts': ['Arts', 'Creative', 'Design'],
    'Science': ['Science', 'Research'],
    'Engineering': ['Engineering'],
    'Finance': ['Finance', 'Banking', 'Investment'],
    'Marketing': ['Marketing', 'Sales'],
    'Design': ['Design', 'UX', 'UI'],
    'AI & Machine Learning': ['AI', 'Machine Learning', 'ML', 'Data Science'],
    'Data Science': ['Data Science', 'Analytics', 'Data'],
    'Entrepreneurship': ['Entrepreneurship', 'Startup', 'Business'],
  };

  const preferredCategories: string[] = [];
  (data.interests || []).forEach((interest) => {
    const categories = categoryMap[interest];
    if (categories) {
      preferredCategories.push(...categories);
    }
  });

  return {
    id: userId,
    name: data.fullName || undefined,
    age: data.age || undefined,
    courseOfStudy: data.courseOfStudy || undefined,
    interests: data.interests || [],
    location: data.location || '',
    careerGoals: careerGoals,
    experienceLevel: data.experience || 'intermediate',
    preferredCategories: [...new Set(preferredCategories)], // Remove duplicates
    availability: 'flexible',
    educationLevel: data.educationLevel,
    preferredLearning: data.preferredLearning,
  };
}

/**
 * A single plain-English reason explaining why an opportunity matched (or
 * carries a risk) for a given user. `kind` lets the UI pick an icon/colour;
 * `points` is how much this reason contributed to the score (0 for risks).
 */
export type MatchReasonKind =
  | "field"
  | "interest"
  | "category"
  | "location"
  | "remote"
  | "experience"
  | "goal"
  | "education";

export interface MatchReason {
  kind: MatchReasonKind;
  label: string;
  points: number;
}

export interface MatchResult {
  score: number;
  /** Positive, ranked reasons ("why this matches you"). Highest impact first. */
  reasons: MatchReason[];
  /** Things to be aware of before applying (short strings). */
  risks: string[];
}

/**
 * Full match evaluation: the 0-100 score plus the human-readable reasons and
 * risks behind it. `calculateMatchScore` is a thin wrapper that returns only
 * the number, so existing callers keep working.
 */
export function evaluateMatch(
  userProfile: UserProfileForRecommendations,
  opportunity: Opportunity
): MatchResult {
  let score = 0;
  const maxScore = 100;
  const reasons: MatchReason[] = [];
  const risks: string[] = [];

  const add = (kind: MatchReasonKind, label: string, points: number) => {
    score += points;
    if (points > 0) reasons.push({ kind, label, points });
  };

  const category = (opportunity.category || "").toLowerCase();
  const title = (opportunity.title || "").toLowerCase();
  const description = (opportunity.description || "").toLowerCase();
  const location = (opportunity.location || "").toLowerCase();

  // Match course of study or interests with opportunity category (30 points max)
  const courseMatch = Boolean(
    userProfile.courseOfStudy &&
      category.includes(userProfile.courseOfStudy.toLowerCase())
  );
  const matchedInterest = userProfile.interests.find(
    (interest) =>
      category.includes(interest.toLowerCase()) ||
      title.includes(interest.toLowerCase()) ||
      description.includes(interest.toLowerCase())
  );

  if (courseMatch) {
    add("field", `Fits your field, ${userProfile.courseOfStudy}`, 25);
  }
  if (matchedInterest) {
    add("interest", `Matches your interest in ${matchedInterest}`, 15);
  }

  // Match location preference (15 points max)
  if (userProfile.location) {
    const isRemote = location.includes("remote");
    const locationMatch = location.includes(userProfile.location.toLowerCase());

    if (locationMatch) {
      add("location", `Open to your region, ${userProfile.location}`, 15);
    } else if (isRemote) {
      add("remote", "Remote — open to applicants anywhere", 10);
    }
  }

  // Match preferred categories (20 points max)
  const matchedCategory = userProfile.preferredCategories.find((cat) =>
    category.includes(cat.toLowerCase())
  );
  if (matchedCategory) {
    add("category", `In a category you follow, ${opportunity.category}`, 20);
  }

  // Match experience level with difficulty (15 points max)
  if (opportunity.difficulty) {
    const difficultyMap: Record<string, string[]> = {
      beginner: ["Easy", "Beginner"],
      intermediate: ["Medium", "Intermediate"],
      advanced: ["Hard", "Advanced", "Expert"],
    };

    const matchingDifficulties =
      difficultyMap[userProfile.experienceLevel] || ["Medium"];
    if (matchingDifficulties.some((d) => opportunity.difficulty?.includes(d))) {
      add("experience", `Suits your ${userProfile.experienceLevel} level`, 15);
    } else if (
      userProfile.experienceLevel === "advanced" &&
      opportunity.difficulty === "Medium"
    ) {
      add("experience", "A comfortable step for your experience", 10);
    } else if (
      userProfile.experienceLevel === "intermediate" &&
      opportunity.difficulty === "Easy"
    ) {
      add("experience", "Well within your experience level", 8);
    } else if (
      userProfile.experienceLevel === "beginner" &&
      (opportunity.difficulty === "Hard" || opportunity.difficulty === "Medium")
    ) {
      risks.push(`Aimed at ${opportunity.difficulty.toLowerCase()} applicants`);
    }
  }

  // Match career goals (15 points max)
  if (userProfile.careerGoals.length > 0) {
    const opportunityText = `${title} ${description} ${opportunity.benefits.join(
      " "
    )}`.toLowerCase();
    let goalPoints = 0;
    const matchedGoals: string[] = [];

    userProfile.careerGoals.forEach((goal) => {
      if (opportunityText.includes(goal.toLowerCase())) {
        goalPoints += 5;
        matchedGoals.push(goal);
      }
    });

    if (matchedGoals.length > 0) {
      add(
        "goal",
        `Supports your goal${matchedGoals.length > 1 ? "s" : ""}: ${matchedGoals
          .slice(0, 2)
          .join(", ")}`,
        Math.min(goalPoints, 15)
      );
    }
  }

  // Bonus: Match education level for opportunities that mention education (5 points)
  if (userProfile.educationLevel) {
    const opportunityText = `${title} ${description}`;
    const educationTerms: Record<string, string[]> = {
      "high-school": ["high school", "secondary"],
      undergraduate: ["undergraduate", "bachelor", "college"],
      graduate: ["graduate", "master"],
      postgraduate: ["phd", "doctoral", "postgraduate"],
      professional: ["professional", "certified"],
    };

    const terms = educationTerms[userProfile.educationLevel] || [];
    if (terms.some((term) => opportunityText.includes(term))) {
      add("education", "Matches your education level", 5);
    }
  }

  reasons.sort((a, b) => b.points - a.points);

  return { score: Math.min(score, maxScore), reasons, risks };
}

/**
 * Calculates match score between user profile and opportunity
 */
export function calculateMatchScore(
  userProfile: UserProfileForRecommendations,
  opportunity: Opportunity
): number {
  return evaluateMatch(userProfile, opportunity).score;
}

/**
 * Filters and sorts opportunities based on user profile
 */
export function getPersonalizedOpportunities(
  userProfile: UserProfileForRecommendations,
  opportunities: Opportunity[],
  options: { minScore?: number; limit?: number } = {}
): { opportunity: Opportunity; matchScore: number }[] {
  const { minScore = 0, limit } = options;

  const scored = opportunities
    .map(opportunity => ({
      opportunity,
      matchScore: calculateMatchScore(userProfile, opportunity)
    }))
    .filter(item => item.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore);

  if (limit) {
    return scored.slice(0, limit);
  }

  return scored;
}

/**
 * Fetches personalized opportunities for a user
 * This is the main entry point for getting filtered opportunities
 */
export async function fetchPersonalizedOpportunities(
  userId: string,
  options: { minScore?: number; limit?: number; forceRefresh?: boolean } = {}
): Promise<{ opportunity: Opportunity; matchScore: number }[]> {
  const { minScore = 10, limit = 50, forceRefresh = false } = options;

  try {
    // Get user's profile and onboarding data
    const profile = await fetchUserProfile(userId);
    const onboardingState = extractOnboardingState(profile);

    if (!onboardingState?.data) {
      // User hasn't completed onboarding, return all opportunities without filtering
      const opportunities = await fetchOpportunities({ force: forceRefresh, userId });
      return opportunities.map(opportunity => ({ opportunity, matchScore: 50 }));
    }

    // Convert onboarding data to recommendation profile
    const userProfile = onboardingToRecommendationProfile(userId, onboardingState.data);

    // Fetch all opportunities
    const opportunities = await fetchOpportunities({ force: forceRefresh, userId });

    // Apply personalization
    return getPersonalizedOpportunities(userProfile, opportunities, { minScore, limit });
  } catch (error) {
    console.error('Failed to fetch personalized opportunities:', error);
    // Fallback: return all opportunities without filtering
    const opportunities = await fetchOpportunities({ force: forceRefresh });
    return opportunities.map(opportunity => ({ opportunity, matchScore: 0 }));
  }
}

/**
 * Gets the top categories for a user based on their profile
 */
export function getUserTopCategories(
  userProfile: UserProfileForRecommendations,
  maxCategories: number = 5
): string[] {
  const categories = new Set<string>();

  // Add preferred categories
  userProfile.preferredCategories.forEach(cat => categories.add(cat));

  // Add interests as categories
  userProfile.interests.forEach(interest => categories.add(interest));

  // Add course of study as a category
  if (userProfile.courseOfStudy) {
    categories.add(userProfile.courseOfStudy);
  }

  return Array.from(categories).slice(0, maxCategories);
}

export default {
  formatUserProfileForRecommendations,
  onboardingToRecommendationProfile,
  calculateMatchScore,
  getPersonalizedOpportunities,
  fetchPersonalizedOpportunities,
  getUserTopCategories,
};