export interface ExtractedOpportunity {
  title: string;
  summary: string | null;
  description: string | null;
  category: "scholarship" | "internship" | "fellowship" | "program" | "other";
  organization: string | null;
  location: string | null;
  deadline: string | null;
  imageUrl: string | null;
  detailUrl: string;
  applicationUrl: string | null;
  sourceUrl: string | null;
  shareText: string;
  status: "complete" | "needs_review";
  qualityScore: number;
  missingFields: string[];
  metadata: Record<string, unknown>;
}

export interface CatalogOpportunity extends ExtractedOpportunity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityUsageSnapshot {
  key: string;
  keyPrefix: string | null;
  environment: "test" | "live" | "unknown";
  requestCount: number;
  lastRequestAt: string | null;
  remainingQuota: number | null;
  monthlyQuota: number | null;
  rateLimitPerMinute: number | null;
}

export interface OpportunityListResponse {
  data: CatalogOpportunity[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

export interface CategorySummary {
  slug: string;
  label: string;
  count: number;
}

export interface DiscoveredItem {
  title: string;
  detailUrl: string;
  description?: string | null;
  imageUrl?: string | null;
  sourceUrl: string;
}

export interface ScrapeRunResult {
  success: boolean;
  sourceUrl: string;
  discovered: number;
  extracted: number;
  opportunities: ExtractedOpportunity[];
  errors: string[];
}
