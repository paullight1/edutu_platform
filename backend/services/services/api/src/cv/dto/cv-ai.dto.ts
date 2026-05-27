export interface CVHeaderDto {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
  website?: string;
}

export interface CVExperienceDto {
  id?: string;
  company?: string;
  role?: string;
  start_date?: string;
  end_date?: string;
  current?: boolean;
  location?: string;
  description?: string;
  highlights?: string[];
}

export interface CVEducationDto {
  id?: string;
  institution?: string;
  degree?: string;
  field?: string;
  start_date?: string;
  end_date?: string;
  gpa?: number;
  highlights?: string[];
}

export interface CVProjectDto {
  id?: string;
  name?: string;
  description?: string;
  url?: string;
  technologies?: string[];
  start_date?: string;
  end_date?: string;
}

export interface CVAchievementDto {
  id?: string;
  title?: string;
  description?: string;
  date?: string;
  issuer?: string;
}

export interface CVDataDto {
  header?: CVHeaderDto;
  summary?: string;
  experience?: CVExperienceDto[];
  education?: CVEducationDto[];
  skills?: string[];
  projects?: CVProjectDto[];
  achievements?: CVAchievementDto[];
}

export interface CVProfileContextDto {
  full_name?: string;
  email?: string;
  country?: string;
  location?: string;
  institution?: string;
  field_of_study?: string;
  education_level?: string;
  interests?: string[];
  skills?: string[];
}

export interface CVGoalContextDto {
  title?: string;
  description?: string;
  progress?: number;
}

export interface CVOpportunityContextDto {
  id?: string;
  title?: string;
  organization?: string;
  category?: string;
  description?: string;
  requirements?: string[];
  skills?: string[];
  benefits?: string[];
  tags?: string[];
  deadline?: string | null;
  applyUrl?: string | null;
}

export interface GenerateCVDraftDto {
  profile?: CVProfileContextDto;
  goals?: CVGoalContextDto[];
  currentCV?: CVDataDto;
  prompt?: string;
  linkedInUrl?: string;
}

export interface TailorCVDto {
  currentCV: CVDataDto;
  opportunity: CVOpportunityContextDto;
  userNotes?: string;
}
