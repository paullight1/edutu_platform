import { sql } from "drizzle-orm";
import { db } from "../db";

export interface OpportunityQualityScorecard {
  total: number;
  active: number;
  active_missing_deadline: number;
  active_imageless: number;
  duplicates: number;
  active_stale_14d: number;
  active_unknown_confidence: number;
  pending_review: number;
  active_listing_urls: number;
  html_titles: number;
  active_thin_description: number;
  active_verified_7d: number;
  newest_verification_at: Date | null;
}

const EMPTY_SCORECARD: OpportunityQualityScorecard = {
  total: 0,
  active: 0,
  active_missing_deadline: 0,
  active_imageless: 0,
  duplicates: 0,
  active_stale_14d: 0,
  active_unknown_confidence: 0,
  pending_review: 0,
  active_listing_urls: 0,
  html_titles: 0,
  active_thin_description: 0,
  active_verified_7d: 0,
  newest_verification_at: null,
};

export async function readOpportunityQualityScorecard(): Promise<OpportunityQualityScorecard> {
  const result = await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where status = 'active')::int as active,
      count(*) filter (
        where status = 'active' and close_date is null and deadline is null
          and coalesce(metadata->>'deadline_confidence', '') <> 'rolling'
      )::int as active_missing_deadline,
      count(*) filter (
        where status = 'active' and (image_url is null or image_url = '')
      )::int as active_imageless,
      count(*) filter (where duplicate_of is not null)::int as duplicates,
      count(*) filter (
        where status = 'active' and last_seen_at < now() - interval '14 days'
      )::int as active_stale_14d,
      count(*) filter (
        where status = 'active'
          and coalesce(metadata->>'deadline_confidence', 'unknown') in ('unknown', '')
      )::int as active_unknown_confidence,
      count(*) filter (where status = 'pending_review')::int as pending_review,
      count(*) filter (
        where status = 'active'
          and coalesce(apply_url, application_url, source_url) ~ '/category/|/tag/|/page/'
      )::int as active_listing_urls,
      count(*) filter (where title ~ '<[a-zA-Z]')::int as html_titles,
      count(*) filter (
        where status = 'active' and (description is null or length(description) < 200)
      )::int as active_thin_description,
      count(*) filter (
        where status = 'active' and last_verified_at >= now() - interval '7 days'
      )::int as active_verified_7d,
      max(last_verified_at) as newest_verification_at
    from opportunities
  `);

  return (
    (result[0] as OpportunityQualityScorecard | undefined) ?? EMPTY_SCORECARD
  );
}
