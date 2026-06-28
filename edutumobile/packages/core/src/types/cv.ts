export interface CVTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  structure_json: CVStructure;
  is_premium: boolean;
  thumbnail_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CVStructure {
  sections: CVSectionConfig[];
}

export interface CVSectionConfig {
  id: string;
  type: CVSectionType;
  label: string;
  repeatable?: boolean;
  fields?: CVFieldConfig[];
}

export type CVSectionType = 
  | 'header'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'achievements'
  | 'research'
  | 'publications'
  | 'references'
  | 'transactions';

export interface CVFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'tags' | 'url';
  required?: boolean;
  placeholder?: string;
}

export interface UserCV {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  data_json: CVData;
  is_primary: boolean;
  match_score: number;
  target_opportunity_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CVData {
  header?: CVHeader;
  summary?: string;
  experience?: CVExperience[];
  education?: CVEducation[];
  skills?: string[];
  projects?: CVProject[];
  achievements?: CVAchievement[];
  research?: CVResearch[];
  publications?: CVPublication[];
  references?: CVReference[];
  transactions?: CVTransaction[];
}

export interface CVHeader {
  full_name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
  website?: string;
}

export interface CVExperience {
  id: string;
  company: string;
  role: string;
  start_date: string;
  end_date?: string;
  current?: boolean;
  location?: string;
  description: string;
  highlights?: string[];
}

export interface CVEducation {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  start_date?: string;
  end_date?: string;
  gpa?: number;
  highlights?: string[];
}

export interface CVProject {
  id: string;
  name: string;
  description: string;
  url?: string;
  technologies?: string[];
  start_date?: string;
  end_date?: string;
}

export interface CVAchievement {
  id: string;
  title: string;
  description: string;
  date?: string;
  issuer?: string;
}

export interface CVResearch {
  id: string;
  title: string;
  institution: string;
  role: string;
  start_date: string;
  end_date?: string;
  description: string;
}

export interface CVPublication {
  id: string;
  title: string;
  journal?: string;
  date: string;
  url?: string;
  coauthors?: string[];
}

export interface CVReference {
  id: string;
  name: string;
  title: string;
  organization: string;
  email?: string;
  phone?: string;
  relationship?: string;
}

export interface CVTransaction {
  id: string;
  deal_name: string;
  value?: number;
  role: string;
  date: string;
  description: string;
}

export interface CVMatchResult {
  score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  suggestions: string[];
  opportunity_id: string;
  opportunity_title: string;
}

export interface AITailorRequest {
  userId: string;
  cvId?: string;
  opportunityId: string;
  targetRole?: string;
}

export interface AITailorResponse {
  tailored_cv: CVData;
  match_score: number;
  improvements: string[];
  matched_keywords: string[];
  missing_keywords: string[];
}
