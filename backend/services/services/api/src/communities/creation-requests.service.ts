import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  communityCreationRequests,
  communityGroups,
  opportunities,
  type CommunityCreationRequest,
} from "../db/schema";
import type {
  CommunityCreationSlotSummary,
  CreateCommunityRequestDto,
} from "./dto/creation-request.dto";
import { MAX_GROUPS_PER_USER } from "./groups.service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CreationRequestLimitError extends Error {
  constructor() {
    super("Community creation limit reached");
    this.name = "CreationRequestLimitError";
  }
}

export class CreationRequestOpportunityMissingError extends Error {
  constructor() {
    super("Opportunity not found");
    this.name = "CreationRequestOpportunityMissingError";
  }
}

export type CreationRequestSubmission = {
  request: CommunityCreationRequest;
  used: number;
};

export interface CreationRequestsStore {
  submitWithinLimit(
    requesterId: string,
    proposal: CreateCommunityRequestDto,
    limit: number,
  ): Promise<CreationRequestSubmission>;
  listForRequester(requesterId: string): Promise<CommunityCreationRequest[]>;
  countUsedSlots(requesterId: string): Promise<number>;
  findById(id: string): Promise<CommunityCreationRequest | null>;
  cancelPending(
    id: string,
    requesterId: string,
  ): Promise<CommunityCreationRequest | null>;
  setCoverImage(
    id: string,
    requesterId: string,
    resourceUrl: string,
  ): Promise<CommunityCreationRequest | null>;
}

export const CREATION_REQUESTS_STORE = Symbol("CREATION_REQUESTS_STORE");

export class DrizzleCreationRequestsStore implements CreationRequestsStore {
  async submitWithinLimit(
    requesterId: string,
    proposal: CreateCommunityRequestDto,
    limit: number,
  ): Promise<CreationRequestSubmission> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community_creation_slots:${requesterId}`}))`,
      );

      if (proposal.opportunityId) {
        const [opportunity] = await tx
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(eq(opportunities.id, proposal.opportunityId))
          .limit(1);
        if (!opportunity) throw new CreationRequestOpportunityMissingError();
      }

      const [[active], [pending]] = await Promise.all([
        tx
          .select({ value: count() })
          .from(communityGroups)
          .where(
            and(
              eq(communityGroups.ownerId, requesterId),
              eq(communityGroups.managementScope, "member"),
              isNull(communityGroups.archivedAt),
            ),
          ),
        tx
          .select({ value: count() })
          .from(communityCreationRequests)
          .where(
            and(
              eq(communityCreationRequests.requesterId, requesterId),
              eq(communityCreationRequests.status, "pending"),
            ),
          ),
      ]);
      const used = Number(active?.value ?? 0) + Number(pending?.value ?? 0);
      if (used >= limit) throw new CreationRequestLimitError();

      const [request] = await tx
        .insert(communityCreationRequests)
        .values({
          requesterId,
          name: proposal.name,
          description: proposal.description?.trim() || null,
          opportunityId: proposal.opportunityId ?? null,
          visibility: proposal.visibility,
          joinPolicy: proposal.joinPolicy,
          coverEmoji: proposal.coverEmoji,
        })
        .returning();
      return { request, used: used + 1 };
    });
  }

  async listForRequester(
    requesterId: string,
  ): Promise<CommunityCreationRequest[]> {
    return db
      .select()
      .from(communityCreationRequests)
      .where(eq(communityCreationRequests.requesterId, requesterId))
      .orderBy(desc(communityCreationRequests.createdAt));
  }

  async countUsedSlots(requesterId: string): Promise<number> {
    const [[active], [pending]] = await Promise.all([
      db
        .select({ value: count() })
        .from(communityGroups)
        .where(
          and(
            eq(communityGroups.ownerId, requesterId),
            eq(communityGroups.managementScope, "member"),
            isNull(communityGroups.archivedAt),
          ),
        ),
      db
        .select({ value: count() })
        .from(communityCreationRequests)
        .where(
          and(
            eq(communityCreationRequests.requesterId, requesterId),
            eq(communityCreationRequests.status, "pending"),
          ),
        ),
    ]);
    return Number(active?.value ?? 0) + Number(pending?.value ?? 0);
  }

  async findById(id: string): Promise<CommunityCreationRequest | null> {
    const [request] = await db
      .select()
      .from(communityCreationRequests)
      .where(eq(communityCreationRequests.id, id))
      .limit(1);
    return request ?? null;
  }

  async cancelPending(
    id: string,
    requesterId: string,
  ): Promise<CommunityCreationRequest | null> {
    const [request] = await db
      .update(communityCreationRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(communityCreationRequests.id, id),
          eq(communityCreationRequests.requesterId, requesterId),
          eq(communityCreationRequests.status, "pending"),
        ),
      )
      .returning();
    return request ?? null;
  }

  async setCoverImage(
    id: string,
    requesterId: string,
    resourceUrl: string,
  ): Promise<CommunityCreationRequest | null> {
    const [request] = await db
      .update(communityCreationRequests)
      .set({ coverImageResourceUrl: resourceUrl, updatedAt: new Date() })
      .where(
        and(
          eq(communityCreationRequests.id, id),
          eq(communityCreationRequests.requesterId, requesterId),
          eq(communityCreationRequests.status, "pending"),
        ),
      )
      .returning();
    return request ?? null;
  }
}

export type CommunityCreationRequestResponse = {
  request: CommunityCreationRequest;
  slots: CommunityCreationSlotSummary;
};

@Injectable()
export class CreationRequestsService {
  private readonly store: CreationRequestsStore;

  constructor(
    @Optional()
    @Inject(CREATION_REQUESTS_STORE)
    store?: CreationRequestsStore,
  ) {
    this.store = store ?? new DrizzleCreationRequestsStore();
  }

  async submit(
    requesterId: string,
    proposal: CreateCommunityRequestDto,
  ): Promise<CommunityCreationRequestResponse> {
    const actorId = this.requireUserId(requesterId);
    try {
      const result = await this.store.submitWithinLimit(
        actorId,
        proposal,
        MAX_GROUPS_PER_USER,
      );
      return {
        request: result.request,
        slots: this.slots(result.used),
      };
    } catch (error) {
      if (error instanceof CreationRequestLimitError) {
        throw new ConflictException({
          statusCode: 409,
          code: "COMMUNITY_CREATION_LIMIT_REACHED",
          message:
            "You can have up to two active or pending communities at a time.",
        });
      }
      if (error instanceof CreationRequestOpportunityMissingError) {
        throw new BadRequestException({
          statusCode: 400,
          code: "COMMUNITY_OPPORTUNITY_NOT_FOUND",
          message: "We couldn't find the opportunity linked to this request.",
        });
      }
      throw error;
    }
  }

  async listMine(requesterId: string): Promise<{
    requests: CommunityCreationRequest[];
    slots: CommunityCreationSlotSummary;
  }> {
    const actorId = this.requireUserId(requesterId);
    const [requests, used] = await Promise.all([
      this.store.listForRequester(actorId),
      this.store.countUsedSlots(actorId),
    ]);
    return { requests, slots: this.slots(used) };
  }

  async cancel(
    requesterId: string,
    requestId: string,
  ): Promise<CommunityCreationRequestResponse> {
    const actorId = this.requireUserId(requesterId);
    this.assertUuid(requestId);
    const request = await this.requireRequest(requestId);
    if (request.requesterId !== actorId) {
      throw new ForbiddenException(
        "You're not allowed to change this community request.",
      );
    }
    if (request.status !== "pending") throw this.stateConflict();
    const cancelled = await this.store.cancelPending(requestId, actorId);
    if (!cancelled) throw this.stateConflict();
    const used = await this.store.countUsedSlots(actorId);
    return { request: cancelled, slots: this.slots(used) };
  }

  async setCoverImage(
    requesterId: string,
    requestId: string,
    resourceUrl: string,
  ): Promise<CommunityCreationRequest> {
    const actorId = this.requireUserId(requesterId);
    this.assertUuid(requestId);
    const request = await this.requireRequest(requestId);
    if (request.requesterId !== actorId) {
      throw new ForbiddenException(
        "You're not allowed to change this community request.",
      );
    }
    if (request.status !== "pending") throw this.stateConflict();
    const updated = await this.store.setCoverImage(
      requestId,
      actorId,
      resourceUrl,
    );
    if (!updated) throw this.stateConflict();
    return updated;
  }

  private requireUserId(value: string): string {
    const normalized = value?.trim();
    if (!normalized) throw new ForbiddenException("Sign in to continue.");
    return normalized;
  }

  private assertUuid(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new NotFoundException("That community request was not found.");
    }
  }

  private async requireRequest(id: string): Promise<CommunityCreationRequest> {
    const request = await this.store.findById(id);
    if (!request) {
      throw new NotFoundException("That community request was not found.");
    }
    return request;
  }

  private slots(used: number): CommunityCreationSlotSummary {
    return { used: Math.max(0, Math.min(used, MAX_GROUPS_PER_USER)), limit: 2 };
  }

  private stateConflict(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: "COMMUNITY_REQUEST_STATE_CHANGED",
      message:
        "This community request has already changed. Refresh and try again.",
    });
  }
}
