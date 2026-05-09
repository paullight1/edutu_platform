export interface OpportunityPreferenceDto {
  preferredCategories?: string[];
  preferredRegions?: string[];
  preferredFundingTypes?: string[];
  preferredOpportunityTypes?: string[];
  preferredSkills?: string[];
  excludedCategories?: string[];
  remoteOnly?: boolean;
  maxDeadlineDays?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OpportunitySignalDto {
  opportunityId: string;
  signalType:
    | 'view'
    | 'click'
    | 'save'
    | 'dismiss'
    | 'apply'
    | 'chat_like'
    | 'chat_dislike'
    | 'recommended_in_chat';
  signalValue?: number;
  source?: string;
  context?: string;
  details?: Record<string, unknown>;
}

export interface RecommendationQueryDto {
  profile?: {
    country?: string | null;
    skills?: string[] | null;
    interests?: string[] | null;
    fieldOfStudy?: string | null;
    field_of_study?: string | null;
  } | null;
  preferences?: OpportunityPreferenceDto | null;
  goals?: Array<{ title?: string | null; description?: string | null }> | null;
  message?: string | null;
  limit?: number;
  minMatchScore?: number;
  excludeOpportunityIds?: string[];
}

export interface UserRecommendationRequestDto {
  message?: string | null;
  limit?: number;
  minMatchScore?: number;
  excludeOpportunityIds?: string[];
}
