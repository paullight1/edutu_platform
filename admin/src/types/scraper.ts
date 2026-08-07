export interface ScrapeJob {
    id: string;
    source_id: number;
    source_name?: string;
    run_type: string;
    status: string;
    urls_discovered: number;
    urls_scraped: number;
    urls_saved?: number;
    urls_failed?: number;
    items_found?: number;
    source_results?: string | Array<Record<string, unknown>> | Record<string, unknown> | null;
    errors: string[];
    warnings: string[];
    duration_seconds: number;
    started_at: string;
    completed_at: string | null;
}

export interface ScrapedOpportunity {
    id?: string | number;
    title: string;
    organization?: string;
    category?: string;
    deadline?: string | null;
    location?: string;
    description?: string;
    summary?: string;
    applyUrl?: string;
    apply_url?: string;
    imageUrl?: string;
    image_url?: string;
    application_url?: string;
    amount?: number | null;
    source: string;
    sourceUrl?: string;
    source_url?: string;
    requirements?: string[];
    benefits?: string[];
    application_process?: string[];
    eligibility?: Record<string, unknown>;
    funding_type?: string | null;
    target_region?: string | null;
    metadata?: {
        extraction_quality_score?: number;
        extraction_missing_fields?: string[];
        needs_review?: boolean;
        ai_improved_at?: string;
        [key: string]: unknown;
    };
}
