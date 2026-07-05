// Shared scraper types used by the Scraper page and its child components.
// Kept in one place so the live-progress modal and the page agree on shapes.

export interface SourceResult {
    name: string;
    url: string;
    status: 'success' | 'failed' | 'skipped' | 'pending';
    itemsFound: number;
    itemsSaved: number;
    error?: string;
    duration?: number;
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

export interface ScrapeResult {
    success: boolean;
    sourcesScraped?: number;
    totalResults?: number;
    duration?: number;
    jobId?: string;
    sources?: string[];
    error?: string;
    sourceResults?: SourceResult[];
    opportunities?: ScrapedOpportunity[];
}

// One row of live per-source progress in the streaming modal.
// `source` holds the RAW source name/slug — it is the key the SSE
// `source-start` / `source-done` events match against, so never mutate it
// for display; prettify only at render time.
export type ScrapeSourceStatus = 'pending' | 'scraping' | 'completed' | 'failed';

export interface ScrapeProgressItem {
    source: string;
    status: ScrapeSourceStatus;
    progress: number;
}
