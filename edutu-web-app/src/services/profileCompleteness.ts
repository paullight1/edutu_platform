import type { Profile } from '../lib/auth';
import type { OnboardingProfileData } from '../types/onboarding';
import type { UserPersonalization } from '../types/admin';

interface ProfileCompletenessResult {
  score: number;
  missingFields: string[];
  isMatchEnabled: boolean;
}

export function calculateProfileCompleteness(
  profile: Profile | null,
  onboarding?: OnboardingProfileData | null,
  personalization?: UserPersonalization | null
): ProfileCompletenessResult {
  const missingFields: string[] = [];
  let score = 0;

  const fullName = profile?.full_name || profile?.name || onboarding?.fullName;
  if (fullName && fullName.trim().length > 0) {
    score += 15;
  } else {
    missingFields.push('Full name');
  }

  const age = profile?.age ?? onboarding?.age;
  if (age && Number.isFinite(age) && age > 0) {
    score += 10;
  } else {
    missingFields.push('Age');
  }

  const country = profile?.country as string | undefined || onboarding?.location;
  const location = profile?.location as string | undefined || onboarding?.location;
  if ((country && country.trim().length > 0) || (location && location.trim().length > 0)) {
    score += 15;
  } else {
    missingFields.push('Country/Location');
  }

  const educationLevel = onboarding?.educationLevel || (profile?.education_level as string | undefined);
  const courseOfStudy = onboarding?.courseOfStudy || (profile?.course_of_study as string | undefined);
  if ((educationLevel && educationLevel.trim().length > 0) || (courseOfStudy && courseOfStudy.trim().length > 0)) {
    score += 10;
  } else {
    missingFields.push('Education level');
  }

  if (courseOfStudy && courseOfStudy.trim().length > 0) {
    score += 10;
  } else {
    missingFields.push('Course of study');
  }

  const interests = personalization?.interests ?? onboarding?.interests ?? [];
  if (interests.length > 0) {
    score += 20;
  } else {
    missingFields.push('Interests');
  }

  const careerGoals = personalization?.careerGoals ?? onboarding?.goals ?? [];
  if (careerGoals.length > 0) {
    score += 10;
  } else {
    missingFields.push('Career goals');
  }

  const avatarUrl = profile?.avatar_url;
  if (avatarUrl && avatarUrl.trim().length > 0) {
    score += 10;
  } else {
    missingFields.push('Profile photo');
  }

  score = Math.min(score, 100);

  return {
    score,
    missingFields,
    isMatchEnabled: score >= 60
  };
}

export function getCompletenessLevel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Getting Started';
  return 'Just Beginning';
}

export default { calculateProfileCompleteness, getCompletenessLevel };
