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
 * Calculates match score between user profile and opportunity
 */
export function calculateMatchScore(
  userProfile: UserProfileForRecommendations,
  opportunity: Opportunity
): number {
  let score = 0;
  const maxScore = 100;

  // Match course of study or interests with opportunity category (30 points max)
  const courseMatch = userProfile.courseOfStudy?.toLowerCase().includes(opportunity.category.toLowerCase());
  const interestMatch = userProfile.interests.some(interest =>
    opportunity.category.toLowerCase().includes(interest.toLowerCase()) ||
    opportunity.title.toLowerCase().includes(interest.toLowerCase()) ||
    opportunity.description.toLowerCase().includes(interest.toLowerCase())
  );

  if (courseMatch) {
    score += 25;
  }
  if (interestMatch) {
    score += 15;
  }

  // Match location preference (15 points max)
  if (userProfile.location) {
    const isRemote = opportunity.location.toLowerCase().includes('remote');
    const locationMatch = opportunity.location.toLowerCase().includes(userProfile.location.toLowerCase());

    if (locationMatch) {
      score += 15;
    } else if (isRemote) {
      score += 10; // Remote opportunities are good for everyone
    }
  }

  // Match preferred categories (20 points max)
  if (userProfile.preferredCategories.some(cat =>
    opportunity.category.toLowerCase().includes(cat.toLowerCase())
  )) {
    score += 20;
  }

  // Match experience level with difficulty (15 points max)
  if (opportunity.difficulty) {
    const difficultyMap: Record<string, string[]> = {
      'beginner': ['Easy', 'Beginner'],
      'intermediate': ['Medium', 'Intermediate'],
      'advanced': ['Hard', 'Advanced', 'Expert'],
    };

    const matchingDifficulties = difficultyMap[userProfile.experienceLevel] || ['Medium'];
    if (matchingDifficulties.some(d => opportunity.difficulty?.includes(d))) {
      score += 15;
    } else if (userProfile.experienceLevel === 'advanced' && opportunity.difficulty === 'Medium') {
      score += 10;
    } else if (userProfile.experienceLevel === 'intermediate' && opportunity.difficulty === 'Easy') {
      score += 8;
    }
  }

  // Match career goals (15 points max)
  if (userProfile.careerGoals.length > 0) {
    const opportunityText = `${opportunity.title} ${opportunity.description} ${opportunity.benefits.join(' ')}`.toLowerCase();
    let goalPoints = 0;

    userProfile.careerGoals.forEach(goal => {
      if (opportunityText.includes(goal.toLowerCase())) {
        goalPoints += 5;
      }
    });

    score += Math.min(goalPoints, 15);
  }

  // Bonus: Match education level for opportunities that mention education (5 points)
  if (userProfile.educationLevel) {
    const opportunityText = `${opportunity.title} ${opportunity.description}`.toLowerCase();
    const educationTerms: Record<string, string[]> = {
      'high-school': ['high school', 'secondary'],
      'undergraduate': ['undergraduate', 'bachelor', 'college'],
      'graduate': ['graduate', 'master'],
      'postgraduate': ['phd', 'doctoral', 'postgraduate'],
      'professional': ['professional', 'certified'],
    };

    const terms = educationTerms[userProfile.educationLevel] || [];
    if (terms.some(term => opportunityText.includes(term))) {
      score += 5;
    }
  }

  // Cap the score to maximum
  return Math.min(score, maxScore);
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