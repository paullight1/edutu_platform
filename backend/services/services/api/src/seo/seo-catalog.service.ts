import { Injectable, NotFoundException } from "@nestjs/common";
import { BlogService } from "../blog/blog.service";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import type {
  PublicBlogPost,
  PublicOpportunity,
} from "./seo-page.render";

export const SEO_CATEGORIES = [
  "scholarships",
  "internships",
  "fellowships",
  "programs",
] as const;

export type SeoCategory = (typeof SEO_CATEGORIES)[number];

export interface SeoPageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasNext: boolean;
  totalPages: number;
}

export interface SeoOpportunityPageResult
  extends SeoPageResult<PublicOpportunity> {
  category: SeoCategory | null;
}

export interface SeoInventory {
  blogPosts: PublicBlogPost[];
  opportunities: PublicOpportunity[];
  generatedAt: Date;
}

const CATEGORY_TO_SERVICE: Record<SeoCategory, string> = {
  scholarships: "scholarship",
  internships: "internship",
  fellowships: "fellowship",
  programs: "program",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(
  row: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function firstValue(
  row: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function boundedPositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function canonicalSiteUrl(value: string): string {
  const normalized = String(value || "https://www.edutu.org")
    .trim()
    .replace(/\/+$/, "");
  return normalized.replace(
    /^https?:\/\/edutu\.org(?=\/|$)/i,
    "https://www.edutu.org",
  );
}

function projectBlogPost(value: unknown): PublicBlogPost | null {
  const row = asRecord(value);
  const id = firstString(row, "id");
  const title = firstString(row, "title");
  const slug = firstString(row, "slug");
  if (!id || !title || !slug) return null;

  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === "string")
    : null;

  return {
    id,
    title,
    slug,
    excerpt: firstString(row, "excerpt"),
    content: firstString(row, "content", "body"),
    authorName: firstString(row, "authorName", "author_name"),
    coverImage: firstString(row, "coverImage", "cover_image"),
    category: firstString(row, "category"),
    tags,
    publishedAt: firstValue(row, "publishedAt", "published_at") as
      | string
      | Date
      | null,
    updatedAt: firstValue(row, "updatedAt", "updated_at") as
      | string
      | Date
      | null,
  };
}

function projectOpportunity(value: unknown): PublicOpportunity | null {
  const row = asRecord(value);
  const id = firstString(row, "id", "opportunity_id", "external_id");
  const title = firstString(row, "title", "name");
  if (!id || !title) return null;

  return {
    id,
    title,
    summary: firstString(
      row,
      "summary",
      "short_description",
      "shortDescription",
    ),
    description: firstString(
      row,
      "description",
      "full_description",
      "fullDescription",
      "content",
    ),
    organization: firstString(
      row,
      "organization",
      "organization_name",
      "organizationName",
      "provider",
    ),
    category: firstString(row, "category", "type"),
    location: firstString(
      row,
      "location",
      "country",
      "region",
      "eligible_countries",
      "eligibleCountries",
    ),
    deadline: firstValue(
      row,
      "deadline",
      "application_deadline",
      "applicationDeadline",
      "closing_date",
      "closingDate",
    ) as string | Date | null,
    benefits: firstValue(
      row,
      "benefits",
      "funding",
      "funding_details",
      "fundingDetails",
    ),
    eligibility: firstValue(
      row,
      "eligibility",
      "eligibility_criteria",
      "eligibilityCriteria",
    ),
    requirements: firstValue(row, "requirements", "criteria"),
    applicationProcess: firstValue(
      row,
      "applicationProcess",
      "application_process",
      "how_to_apply",
      "howToApply",
    ),
    applicationUrl: firstString(
      row,
      "applicationUrl",
      "application_url",
      "applyUrl",
      "apply_url",
      "url",
    ),
    sourceUrl: firstString(
      row,
      "sourceUrl",
      "source_url",
      "canonicalUrl",
      "canonical_url",
    ),
    imageUrl: firstString(
      row,
      "imageUrl",
      "image_url",
      "source_image_url",
      "share_image_url",
    ),
    updatedAt: firstValue(
      row,
      "updatedAt",
      "updated_at",
      "lastVerifiedAt",
      "last_verified_at",
    ) as string | Date | null,
    createdAt: firstValue(row, "createdAt", "created_at") as
      | string
      | Date
      | null,
  };
}

function totalPagesForWindow(page: number, hasNext: boolean): number {
  return page + (hasNext ? 1 : 0);
}

@Injectable()
export class SeoCatalogService {
  constructor(
    private readonly blog: BlogService,
    private readonly opportunities: OpportunitiesService,
  ) {}

  getSiteUrl(): string {
    return canonicalSiteUrl(this.opportunities.getPublicAppBaseUrl());
  }

  isCategory(value: string): value is SeoCategory {
    return (SEO_CATEGORIES as readonly string[]).includes(value);
  }

  async getBlogPage(
    pageInput: number,
    pageSizeInput: number,
  ): Promise<SeoPageResult<PublicBlogPost>> {
    const page = boundedPositiveInteger(pageInput, 1, 1000);
    const pageSize = boundedPositiveInteger(pageSizeInput, 12, 50);
    const rows = await this.blog.findAll({
      status: "published",
      limit: pageSize + 1,
      offset: (page - 1) * pageSize,
    });
    const projected = rows
      .map(projectBlogPost)
      .filter((post): post is PublicBlogPost => Boolean(post));
    const hasNext = projected.length > pageSize;

    return {
      items: projected.slice(0, pageSize),
      page,
      pageSize,
      hasNext,
      totalPages: totalPagesForWindow(page, hasNext),
    };
  }

  async getBlogPost(slug: string): Promise<PublicBlogPost | null> {
    const row = await this.blog.peekBySlug(slug);
    if (!row || row.status !== "published") return null;
    return projectBlogPost(row);
  }

  async getOpportunityPage(
    pageInput: number,
    pageSizeInput: number,
    category: SeoCategory | null = null,
  ): Promise<SeoOpportunityPageResult> {
    const page = boundedPositiveInteger(pageInput, 1, 1000);
    const pageSize = boundedPositiveInteger(pageSizeInput, 24, 60);
    const rows = await this.opportunities.findAll(
      pageSize + 1,
      (page - 1) * pageSize,
      "active",
      category ? CATEGORY_TO_SERVICE[category] : undefined,
    );
    const projected = rows
      .map(projectOpportunity)
      .filter((opportunity): opportunity is PublicOpportunity =>
        Boolean(opportunity),
      );
    const hasNext = projected.length > pageSize;

    return {
      items: projected.slice(0, pageSize),
      page,
      pageSize,
      hasNext,
      totalPages: totalPagesForWindow(page, hasNext),
      category,
    };
  }

  async getOpportunity(id: string): Promise<PublicOpportunity | null> {
    try {
      const row = await this.opportunities.findOne(id);
      return row ? projectOpportunity(row) : null;
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  async getSitemapInventory(
    options: { batchSize?: number } = {},
  ): Promise<SeoInventory> {
    const batchSize = boundedPositiveInteger(options.batchSize, 100, 100);
    const blogPosts = new Map<string, PublicBlogPost>();
    const opportunities = new Map<string, PublicOpportunity>();

    for (let offset = 0; offset < 1000; offset += batchSize) {
      const rows = await this.blog.findAll({
        status: "published",
        limit: batchSize,
        offset,
      });
      for (const row of rows) {
        const projected = projectBlogPost(row);
        if (projected) blogPosts.set(projected.slug, projected);
      }
      if (rows.length < batchSize) break;
    }

    for (let offset = 0; offset < 5000; offset += batchSize) {
      const rows = await this.opportunities.findAll(
        batchSize,
        offset,
        "active",
      );
      for (const row of rows) {
        const projected = projectOpportunity(row);
        if (projected) opportunities.set(projected.id, projected);
      }
      if (rows.length < batchSize) break;
    }

    return {
      blogPosts: Array.from(blogPosts.values()),
      opportunities: Array.from(opportunities.values()),
      generatedAt: new Date(),
    };
  }
}
