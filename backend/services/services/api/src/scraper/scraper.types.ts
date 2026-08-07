import { z } from "zod";

export interface ScrapeOptions {
  sourceId?: number;
  allSources?: boolean;
  maxPages?: number;
  incremental?: boolean;
  runType?: "manual" | "scheduled";
}

export type ScrapeStreamEvent =
  | { type: "start"; totalSources: number; sources: string[] }
  | { type: "source-start"; name: string }
  | { type: "opportunity"; opportunity: unknown }
  | { type: "source-skip"; name: string; page: number; skipped: number }
  | {
      type: "source-done";
      name: string;
      itemsFound: number;
      itemsSkipped?: number;
      error?: string;
    }
  | { type: "control"; state: "paused" | "resumed" | "stopping" };

export type ScrapeEventListener = (event: ScrapeStreamEvent) => void;

export interface ActiveRunControl {
  paused: boolean;
  stopRequested: boolean;
  emit?: ScrapeEventListener;
}

export interface ScrapeSource {
  id: number;
  name: string;
  url: string;
  tier: number;
  category: string;
  enabled: boolean;
  priority?: number;
  parent_id?: number;
  is_group?: boolean;
  // Source-specific selector configuration is intentionally open-ended; each
  // adapter validates the keys it consumes.
  config?: any;
}

export interface RawItem {
  title: string;
  apply_url: string;
  direct_apply_url?: string | null;
  image_url?: string | null;
  source_image_url?: string | null;
  description?: string;
  amount?: number | null;
  deadline?: string | null;
  location?: string;
  requirements?: string[];
  benefits?: string[];
  application_process?: string[];
  summary?: string;
  eligibility?: Record<string, unknown>;
  application_fee?: {
    is_free: boolean | null;
    amount: number | null;
    currency: string | null;
  } | null;
  red_flags?: string[];
  funding_type?: string;
  target_region?: string;
  enrichment_confidence?: number;
  enrichment_notes?: string[];
  canonical_category?: string;
  source: string;
  source_url: string;
  source_id?: number;
}

const boundedString = (max: number) =>
  z.preprocess(
    (value) => (value === null ? undefined : value),
    z
      .string()
      .trim()
      .max(max)
      .optional()
      .transform((value) => value || undefined),
  );

export const DeepSeekExtractionSchema = z.object({
  summary: boundedString(320),
  description: boundedString(1800),
  requirements: z.array(z.string().trim().min(2)).optional().default([]),
  benefits: z.array(z.string().trim().min(2)).optional().default([]),
  deadline: z.string().nullable().optional(),
  application_process: z.array(z.string().trim().min(2)).optional().default([]),
  eligibility: z
    .object({
      countries: z.array(z.string()).nullable().optional(),
      age_min: z.number().nullable().optional(),
      age_max: z.number().nullable().optional(),
      degree_levels: z.array(z.string()).nullable().optional(),
      gender: z.string().nullable().optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
  application_fee: z
    .object({
      is_free: z.boolean().nullable(),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
    })
    .nullable()
    .optional(),
  red_flags: z.array(z.string()).default([]),
  funding_type: boundedString(120),
  target_region: boundedString(120),
  confidence: z.number().min(0).max(1).optional().default(0),
  notes: z.array(z.string().trim().min(2)).optional().default([]),
});

export type DeepSeekExtraction = z.infer<typeof DeepSeekExtractionSchema>;

export interface SourceResult {
  name: string;
  url: string;
  status: "success" | "failed" | "skipped";
  itemsFound: number;
  itemsSaved: number;
  itemsSkipped?: number;
  urlsDiscovered?: number;
  error?: string;
  duration?: number;
  warnings?: string[];
}

export interface RunOutcome {
  saved: number;
  published: number;
  needsReview: number;
  withDeadline: number;
  withImage: number;
  withOrganization: number;
  withDirectApplyLink: number;
  duplicateImagesStripped: number;
  missingFieldCounts: Record<string, number>;
}

export interface ScrapeResult {
  success: boolean;
  sourcesScraped?: number;
  totalResults?: number;
  itemsSkipped?: number;
  duration?: number;
  jobId?: string;
  sources?: string[];
  error?: string;
  sourceResults?: SourceResult[];
  opportunities?: RawItem[];
  outcome?: RunOutcome | null;
}
