export type OpportunityDifficulty = 'Easy' | 'Medium' | 'Hard';
export type OpportunitySource = 'admin' | 'n8n' | 'manual' | 'import';

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  category: string;
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
  lastUpdated?: string;

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
