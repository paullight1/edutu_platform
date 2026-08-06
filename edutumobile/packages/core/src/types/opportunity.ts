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
  /**
   * True when `image` is the generated branded share card (which renders the
   * opportunity title into the artwork) rather than a real scraped/source
   * image. Consumers that overlay their own title should suppress it in this
   * case to avoid the title appearing twice.
   */
  imageIsShareCard?: boolean;
  match: number;
  /**
   * Profile fit only (0-100), with no behavioral adjustment. `match` is the
   * feed-ordering score and absorbs engagement signals — including the
   * impression-fatigue penalty for items shown repeatedly without a tap — so
   * it drifts for reasons that have nothing to do with how competitive the
   * user is. Anything answering "can I actually win this?" reads matchFit.
   * Absent on responses from servers older than this field.
   */
  matchFit?: number;
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
  /**
   * Cost to apply, persisted on `metadata.application_fee`. `isFree === true`
   * means explicitly free; `amount` is the fee when known. When both are null (or
   * absent) the fee is unknown and the UI renders nothing — never guess.
   */
  applicationFee?: {
    isFree: boolean | null;
    amount: number | null;
    currency: string | null;
  } | null;
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
