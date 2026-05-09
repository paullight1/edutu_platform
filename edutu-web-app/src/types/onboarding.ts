export interface OnboardingProfileData {
  fullName: string;
  age: number | null;
  courseOfStudy: string;
  interests: string[];
  goals: string[];
  educationLevel: string;
  location: string;
  experience: string;
  preferredLearning: string[];
}

export interface OnboardingState {
  completed: boolean;
  completedAt: string;
  data: OnboardingProfileData;
}

