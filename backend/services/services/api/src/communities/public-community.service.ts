import { Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { communityGroups } from "../db/schema";

export type PublicCommunityCandidate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverEmoji: string;
  memberCount: number;
  messageCount: number;
  opportunityId: string | null;
  visibility: string;
  expiresAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
};

export type PublicCommunityGroupSummary = Omit<
  PublicCommunityCandidate,
  "visibility" | "archivedAt"
>;

export interface PublicCommunityStore {
  listCandidates(): Promise<PublicCommunityCandidate[]>;
  findCandidateBySlug(slug: string): Promise<PublicCommunityCandidate | null>;
}

const PUBLIC_LIST_LIMIT = 50;

function safeSelection() {
  return {
    id: communityGroups.id,
    slug: communityGroups.slug,
    name: communityGroups.name,
    description: communityGroups.description,
    coverEmoji: communityGroups.coverEmoji,
    memberCount: communityGroups.memberCount,
    messageCount: communityGroups.messageCount,
    opportunityId: communityGroups.opportunityId,
    visibility: communityGroups.visibility,
    expiresAt: communityGroups.expiresAt,
    archivedAt: communityGroups.archivedAt,
    createdAt: communityGroups.createdAt,
  };
}

function activePublicConditions() {
  return and(
    eq(communityGroups.visibility, "public"),
    isNull(communityGroups.archivedAt),
    or(
      isNull(communityGroups.expiresAt),
      sql`${communityGroups.expiresAt} > now()`,
    ),
  );
}

export class DrizzlePublicCommunityStore implements PublicCommunityStore {
  async listCandidates(): Promise<PublicCommunityCandidate[]> {
    return db
      .select(safeSelection())
      .from(communityGroups)
      .where(activePublicConditions())
      .orderBy(
        sql`${communityGroups.lastMessageAt} desc nulls last`,
        desc(communityGroups.createdAt),
      )
      .limit(PUBLIC_LIST_LIMIT);
  }

  async findCandidateBySlug(
    slug: string,
  ): Promise<PublicCommunityCandidate | null> {
    const [row] = await db
      .select(safeSelection())
      .from(communityGroups)
      .where(and(activePublicConditions(), eq(communityGroups.slug, slug)))
      .limit(1);
    return row ?? null;
  }
}

export function isPublicCommunityCandidate(
  row: PublicCommunityCandidate,
  now: Date,
): boolean {
  return (
    row.visibility === "public" &&
    row.archivedAt === null &&
    (row.expiresAt === null || row.expiresAt.getTime() > now.getTime())
  );
}

export function projectPublicCommunityGroup(
  row: PublicCommunityCandidate,
): PublicCommunityGroupSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    coverEmoji: row.coverEmoji,
    memberCount: row.memberCount,
    messageCount: row.messageCount,
    opportunityId: row.opportunityId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PublicCommunityService {
  constructor(
    private readonly store: PublicCommunityStore = new DrizzlePublicCommunityStore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(limit = 20): Promise<PublicCommunityGroupSummary[]> {
    const resolvedLimit = Math.max(
      1,
      Math.min(Math.floor(limit || 20), PUBLIC_LIST_LIMIT),
    );
    const instant = this.now();
    return (await this.store.listCandidates())
      .filter((row) => isPublicCommunityCandidate(row, instant))
      .slice(0, resolvedLimit)
      .map(projectPublicCommunityGroup);
  }

  async getBySlug(slug: string): Promise<PublicCommunityGroupSummary> {
    const normalized = slug.trim();
    if (!normalized) throw new NotFoundException("That community was not found.");
    const row = await this.store.findCandidateBySlug(normalized);
    if (!row || !isPublicCommunityCandidate(row, this.now())) {
      // Deliberately identical for missing/private/closed groups: an anonymous
      // caller must not be able to probe whether a private room exists.
      throw new NotFoundException("That community was not found.");
    }
    return projectPublicCommunityGroup(row);
  }
}
