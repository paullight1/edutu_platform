export type OpportunityDifficulty = 'Easy' | 'Medium' | 'Hard';
export type OpportunitySource = 'admin' | 'n8n' | 'manual' | 'import';
export type OpportunityCanonicalCategory = 'scholarships' | 'careers' | 'leadership' | 'global_programs' | 'training_conferences' | 'other';

export type MatchReasonKind =
  | 'field'
  | 'interest'
  | 'category'
  | 'location'
  | 'remote'
  | 'experience'
  | 'goal'
  | 'education';

export interface MatchReason {
  kind: MatchReasonKind;
  /** Plain-English explanation shown to the user, e.g. "Matches your interest in AI". */
  label: string;
  /** Contribution this reason made to the raw match score. */
  points: number;
}

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  category: string;
  canonicalCategory?: OpportunityCanonicalCategory;
  deadline?: string | null;
  location: string;
  description: string;
  requirements: string[];
  benefits: string[];
  applicationProcess: string[];
  image?: string | null;
  match: number;
  difficulty?: OpportunityDifficulty | null;
  applicants?: string;
  successRate?: string;
  applyUrl?: string;
  shareImageUrl?: string | null;
  lastUpdated?: string;
  aiSummary?: string;
  matchReasons?: string[];
  matchRisks?: string[];
  matchReasonDetails?: MatchReason[];
  aiTags?: string[];

  // Admin-relevant fields
  source?: OpportunitySource;
  externalId?: string;
  tags?: string[];
  isRemote?: boolean;
  featured?: boolean;
  featuredRank?: number;
  stipend?: number;
  currency?: string;
  eligibility?: Record<string, unknown>;
  openDate?: string | null;
  createdAt?: string;
  createdBy?: string;

  // Analytics metadata
  viewCount?: number;
  applyCount?: number;
  bookmarkCount?: number;

  // Roadmap / preparation steps
  roadmap?: Array<{ id?: string; title: string; description?: string }>;
}

export interface OpportunityFilters {
  category?: string;
  location?: string;
  isRemote?: boolean;
  featured?: boolean;
  minMatch?: number;
  tags?: string[];
  search?: string;
  sortBy?: 'match' | 'deadline' | 'createdAt' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
