import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { ApiConsumerContext } from "../auth/current-api-consumer.decorator.js";
import { ApiKeyStore } from "../auth/api-key.store.js";

type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export interface OpportunityRecord {
  id: string;
  title: string;
  organization: string;
  description: string;
  category: "scholarship" | "internship" | "fellowship" | "program" | "other";
  difficulty: DifficultyLevel;
  location: string;
  countries: string[];
  remote: boolean;
  deadline: string | null;
  applicationUrl: string | null;
  sourceUrl: string;
  requirements: string[];
  benefits: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ListQuery {
  q?: string;
  category?: string;
  country?: string;
  remote?: boolean;
  deadline_after?: string;
  deadline_before?: string;
  difficulty?: DifficultyLevel;
  limit?: number;
  cursor?: string;
  sort?: "updated_desc" | "updated_asc" | "deadline_asc" | "deadline_desc";
}

interface SyncQuery {
  updated_after?: string;
  limit?: number;
  cursor?: string;
  sort?: "updated_desc" | "updated_asc" | "deadline_asc" | "deadline_desc";
}

const NOW = new Date().toISOString();

const BASE_OPPORTUNITIES: Array<Omit<OpportunityRecord, "id" | "createdAt" | "updatedAt">> = [
  {
    title: "Global Women in Tech Scholarship Program",
    organization: "TechForward",
    description:
      "A full scholarship for advanced engineering candidates with mentorship, a capstone project, and guaranteed internship interviews.",
    category: "scholarship",
    difficulty: "advanced",
    location: "Remote",
    countries: ["Global"],
    remote: true,
    deadline: "2026-10-20T23:59:59.000Z",
    applicationUrl: "https://example.edu/scholarship/techforward-2026",
    sourceUrl: "https://example.edu/scholarship/feed",
    requirements: ["STEM degree", "Portfolio", "Essay"],
    benefits: ["Full tuition", "Monthly stipend", "Mentorship cohort"],
    tags: ["engineering", "women", "remote"],
  },
  {
    title: "Future Leaders Internship Fellowship",
    organization: "City University Fellowship Office",
    description:
      "A 12-week internship fellowship with stipend and direct placement support for students in data science and policy.",
    category: "internship",
    difficulty: "intermediate",
    location: "Toronto, Canada",
    countries: ["Canada"],
    remote: false,
    deadline: "2026-09-08T23:59:59.000Z",
    applicationUrl: "https://example.edu/internship/2026/future-leaders",
    sourceUrl: "https://example.edu/internship",
    requirements: ["University enrollment", "CV", "2 references"],
    benefits: ["Stipend", "Mentor", "Certificate"],
    tags: ["internship", "policy", "data-science"],
  },
  {
    title: "Global Fellowship for Public Policy Makers",
    organization: "Civic Institute",
    description:
      "Six-month paid fellowship for young policy professionals building civic-tech solutions.",
    category: "fellowship",
    difficulty: "intermediate",
    location: "Nairobi, Kenya",
    countries: ["Kenya", "Uganda", "Tanzania"],
    remote: true,
    deadline: "2026-08-10T23:59:59.000Z",
    applicationUrl: "https://example.org/fellowship/policy-makers",
    sourceUrl: "https://example.org/fellowships/listing",
    requirements: ["Public service background", "Project plan", "Essay"],
    benefits: ["Living allowance", "Visa support", "Mentorship"],
    tags: ["public-policy", "civic-tech", "international"],
  },
  {
    title: "Engineering Bootcamp for High-Achievers",
    organization: "STEM Labs",
    description:
      "A program-based track offering practical capstone projects and startup placement for finalists.",
    category: "program",
    difficulty: "advanced",
    location: "Lagos, Nigeria",
    countries: ["Nigeria", "Ghana", "Rwanda"],
    remote: false,
    deadline: "2026-11-15T23:59:59.000Z",
    applicationUrl: "https://example.net/programs/engineering-bootcamp",
    sourceUrl: "https://example.net/programs",
    requirements: ["Bachelor's degree", "Coding basics", "Online interview"],
    benefits: ["Courseware", "Mentorship", "Startup incubator access"],
    tags: ["engineering", "capstone", "career"],
  },
  {
    title: "Global Scholarship for AI Research",
    organization: "Future Labs",
    description:
      "Funding for final-year students researching trustworthy AI and real-world deployment.",
    category: "scholarship",
    difficulty: "advanced",
    location: "Remote",
    countries: ["UK", "US", "Canada"],
    remote: true,
    deadline: "2026-07-01T23:59:59.000Z",
    applicationUrl: null,
    sourceUrl: "https://futurelabs.example.org/opportunities",
    requirements: ["AI project", "Publication record", "CV"],
    benefits: ["Research stipend", "Conference allowance", "Mentor review"],
    tags: ["ai", "research", "funding"],
  },
];

function catalog() {
  return BASE_OPPORTUNITIES.map((seed, index) => {
    const created = new Date(Date.parse(NOW) - index * 3_600_000 * 2).toISOString();
    return {
      id: `opp_${String(index + 1).padStart(3, "0")}`,
      createdAt: created,
      updatedAt: new Date(Date.parse(created) + 86_400_000).toISOString(),
      ...seed,
    };
  });
}

export class OpportunityQueryError extends Error {}

@Injectable()
export class OpportunitiesService {
  async listOpportunities(
    query: ListQuery,
    consumer: ApiConsumerContext,
  ) {
    const normalizedLimit = this.toLimit(query.limit, 20, 50);
    const rows = this.searchCatalog(query);
    const sorted = this.sortCatalog(rows, query.sort);
    const paged = this.applyCursor(sorted, query.cursor, normalizedLimit);

    const base = paged.slice(0, normalizedLimit);
    return {
      object: "list",
      data: base.map((item) => this.toPublic(item)),
      pagination: {
        next_cursor: base.length === normalizedLimit ? this.nextCursor(base, query.sort) : null,
        has_more: sorted.length > (query.cursor ? this.decodeCursor(query.cursor) + normalizedLimit : 0) + normalizedLimit,
      },
      meta: {
        generatedAt: new Date().toISOString(),
        requestId: consumer.requestId,
      },
    };
  }

  async syncOpportunities(
    query: SyncQuery,
    consumer: ApiConsumerContext,
  ) {
    if (query.updated_after && Number.isNaN(Date.parse(query.updated_after))) {
      throw new OpportunityQueryError("updated_after must be ISO date");
    }

    const baseQuery: ListQuery = {
      limit: query.limit,
      cursor: query.cursor,
      sort: query.sort,
      category: undefined,
    };
    const result = await this.listOpportunities(baseQuery, consumer);
    const updatedAfter = query.updated_after
      ? new Date(query.updated_after).toISOString()
      : null;

    const data = updatedAfter
      ? result.data.filter(
          (item: { updated_at?: string | null; title: string }) => {
            const row = catalog().find((r) => r.title === item.title);
            if (!row?.updatedAt || !updatedAfter) return true;
            return row.updatedAt >= updatedAfter;
          },
        )
      : result.data;

    return {
      object: "sync",
      data,
      pagination: result.pagination,
      meta: result.meta,
      updated_after: updatedAfter,
    };
  }

  async getOpportunity(id: string) {
    const found = catalog().find((item) => item.id === id);
    if (!found) return null;
    return this.toPublic(found);
  }

  async listCategories() {
    const rows = catalog();
    const counts = new Map<string, number>();
    rows.forEach((entry) => {
      counts.set(entry.category, (counts.get(entry.category) || 0) + 1);
    });

    return {
      object: "list",
      data: Array.from(counts.entries())
        .map(([slug, count]) => ({
          slug,
          label: slug.replace(/^\w/, (char) => char.toUpperCase()),
          count,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async getUsage(consumer: ApiConsumerContext, store: ApiKeyStore) {
    const usage = await store.getUsageForProject(consumer.projectId);
    const events = await store.getUsageEvents(consumer.projectId, 10);
    return {
      object: "usage",
      consumer: {
        id: consumer.id,
        projectId: consumer.projectId,
        plan: consumer.plan,
        environment: consumer.environment,
        scopes: consumer.scopes,
      },
      quota: {
        object: "quota",
        monthlyLimit: usage?.monthlyLimit ?? consumer.monthlyQuota ?? null,
        monthlyRemaining:
          usage?.monthlyRemaining ??
          (consumer.monthlyQuota === null
            ? null
            : Math.max((consumer.monthlyQuota ?? 0) - 0, 0)),
        monthlyRequestCount: usage?.monthlyRequestCount ?? 0,
        resetAt: usage?.resetAt ?? null,
      },
      creditsRemaining:
        usage?.creditsRemaining ?? consumer.creditsBalance ?? null,
      lastUsedAt: usage?.lastUsedAt ?? null,
      recentRequests: events,
      meta: {
        generatedAt: new Date().toISOString(),
        requestId: consumer.requestId,
      },
    };
  }

  private searchCatalog(query: ListQuery) {
    const rows = catalog();
    const rawCategory = query.category?.trim().toLowerCase();
    const rawQuery = query.q?.trim().toLowerCase();
    const rawCountry = query.country?.trim().toLowerCase();
    const remote = query.remote;
    const difficulty = query.difficulty;
    const deadlineAfter = query.deadline_after
      ? new Date(query.deadline_after)
      : null;
    const deadlineBefore = query.deadline_before
      ? new Date(query.deadline_before)
      : null;

    return rows.filter((row) => {
      if (rawCategory && row.category.toLowerCase() !== rawCategory) {
        return false;
      }
      if (rawQuery) {
        const text = `${row.title} ${row.organization} ${row.description}`.toLowerCase();
        if (!text.includes(rawQuery)) return false;
      }
      if (rawCountry && !row.countries.some((country) => country.toLowerCase().includes(rawCountry))) {
        return false;
      }
      if (remote !== undefined && row.remote !== remote) {
        return false;
      }
      if (difficulty && row.difficulty !== difficulty) {
        return false;
      }
      if (deadlineAfter && new Date(row.deadline ?? "").getTime() < deadlineAfter.getTime()) {
        return false;
      }
      if (deadlineBefore && row.deadline) {
        if (new Date(row.deadline).getTime() > deadlineBefore.getTime()) {
          return false;
        }
      } else if (deadlineBefore && !row.deadline) {
        return false;
      }
      return true;
    });
  }

  private sortCatalog(
    rows: OpportunityRecord[],
    sort: ListQuery["sort"] = "updated_desc",
  ) {
    const copy = [...rows];
    const byUpdated = (row: OpportunityRecord) => row.updatedAt;
    const byDeadline = (row: OpportunityRecord) =>
      row.deadline ?? "9999-12-31T00:00:00.000Z";
    switch (sort) {
      case "updated_asc":
        copy.sort((a, b) => byUpdated(a).localeCompare(byUpdated(b)));
        break;
      case "deadline_asc":
        copy.sort((a, b) => byDeadline(a).localeCompare(byDeadline(b)));
        break;
      case "deadline_desc":
        copy.sort((a, b) => byDeadline(b).localeCompare(byDeadline(a)));
        break;
      default:
        copy.sort((a, b) => byUpdated(b).localeCompare(byUpdated(a)));
    }
    return copy;
  }

  private applyCursor(rows: OpportunityRecord[], cursor: string | undefined, limit: number) {
    const start = this.decodeCursor(cursor);
    const end = start + limit;
    return rows.slice(start, end);
  }

  private decodeCursor(cursor?: string) {
    if (!cursor) return 0;
    const parsed = Number.parseInt(cursor, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  }

  private nextCursor(items: OpportunityRecord[], _sort?: ListQuery["sort"]) {
    if (items.length === 0) return null;
    const last = catalog().find((item) => item.id === items[items.length - 1].id);
    if (!last) return null;
    const index = catalog().findIndex((item) => item.id === last.id);
    return index >= 0 ? String(index + 1) : null;
  }

  private toLimit(value: number | undefined, fallback: number, max: number) {
    const parsed = Number(value ?? fallback);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(Math.trunc(parsed), 1), max);
  }

  private toPublic(row: OpportunityRecord) {
    const seed = randomUUID();
    return {
      id: row.id,
      object: "opportunity",
      title: row.title,
      provider: row.organization,
      description: row.description,
      category: row.category,
      difficulty: row.difficulty,
      location: row.location,
      countries: row.countries,
      remote: row.remote,
      deadline: row.deadline,
      application_url: row.applicationUrl,
      source_url: row.sourceUrl,
      requirements: row.requirements,
      benefits: row.benefits,
      tags: row.tags,
      updated_at: row.updatedAt,
      created_at: row.createdAt,
      quality_token: seed,
    };
  }
}
