export interface CVTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  structure_json: CVStructure;
  is_premium: boolean;
  thumbnail_url?: string;
  /**
   * Stable key into the template design registry. DB rows own the copy
   * (name/description/premium); the slug decides how the document is drawn.
   */
  slug?: string;
  created_at?: string;
  updated_at?: string;
}

/** Where the name/contact block sits and how it is treated. */
export type CVHeaderStyle = 'left' | 'centered' | 'band' | 'split';
/** How a section heading is separated from the body. */
export type CVSectionRule = 'underline' | 'tick' | 'boxed' | 'none';
/** Vertical rhythm of the whole document. */
export type CVDensity = 'compact' | 'regular' | 'roomy';
/** How the skills list is laid out. */
export type CVSkillStyle = 'chips' | 'inline' | 'bulleted';
/** Print-safe font families. Anything else risks a substitution in the PDF. */
export type CVFontFamily = 'sans' | 'serif';

/**
 * The single source of truth for how a template looks.
 *
 * Every renderer — the exported PDF (`buildCVHtml`), the in-app preview, and
 * the gallery thumbnails — derives its styling from this one object, so a
 * template can never look one way in the picker and another way on paper.
 */
export interface CVTemplateDesign {
  slug: string;
  accent: string;
  /** Low-opacity accent for fills and tints. Must keep body text readable. */
  accentSoft: string;
  ink: string;
  muted: string;
  bodyFont: CVFontFamily;
  displayFont: CVFontFamily;
  headerStyle: CVHeaderStyle;
  sectionRule: CVSectionRule;
  sectionCase: 'upper' | 'title';
  density: CVDensity;
  skillStyle: CVSkillStyle;
  /**
   * True when the document is pure text on white with no colour behind any
   * glyph — the most conservative thing to feed an ATS parser. All templates
   * are single-column and therefore parseable; this flags the extra-safe ones.
   */
  atsPlain: boolean;
  /** Which sections this template renders, in order. Drives the PDF and the wizard. */
  sections: CVSectionType[];
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

export type AtsChecklistStatus = 'pass' | 'fix' | 'n/a';

export interface AtsChecklistItem {
  id: string;
  label: string;
  status: AtsChecklistStatus;
  /** Specific to this CV/opportunity pair — which bullets/phrases to act on. */
  detail?: string;
  /** One educational sentence on why this item matters. */
  why?: string;
}

export interface QuantifyQuestion {
  /** Exact bullet/summary text the question is about. */
  target: string;
  question: string;
}

export interface AITailorResponse {
  tailored_cv: CVData;
  match_score: number;
  improvements: string[];
  matched_keywords: string[];
  missing_keywords: string[];
  /** ATS-grade audit — absent on old cached results. */
  atsChecklist?: AtsChecklistItem[];
  /** Honest role-title mirror suggestion; null/absent when it would inflate. */
  proposedTitle?: string | null;
  /** Short concrete questions for bullets that lack a number (max 4). */
  quantifyQuestions?: QuantifyQuestion[];
}
