import { Injectable } from "@nestjs/common";
import type { OpportunityJourney } from "../db/opportunity-journey.schema";
import {
  DatabaseOpportunityJourneyLegacyStore,
  type LegacyOpportunityApplication,
  type LegacyOpportunityBookmark,
  type OpportunityJourneyLegacyStore,
} from "./opportunity-journey-legacy.store";
import { OpportunityJourneyOperationsRepository } from "./opportunity-journey-operations.repository";
import type { OpportunityJourneyState } from "./opportunity-journey.types";

interface LegacyJourneyCandidate {
  source: "bookmark" | "application";
  sourceId: string;
  opportunityId: string;
  state: OpportunityJourneyState;
  appliedAt: Date | null;
  closedAt: Date | null;
  outcome: string | null;
}

const STATE_STRENGTH: Record<OpportunityJourneyState, number> = {
  shortlisted: 1,
  pursuing: 2,
  preparing: 3,
  ready_to_apply: 4,
  application_opened: 5,
  applied: 6,
  interview: 7,
  offer: 8,
  rejected: 8,
  withdrawn: 8,
  no_response: 8,
  expired: 8,
  archived: 9,
};

const APPLICATION_STATE: Record<string, OpportunityJourneyState> = {
  draft: "preparing",
  interested: "preparing",
  preparing: "preparing",
  submitted: "applied",
  applied: "applied",
  interviewing: "interview",
  interview: "interview",
  offered: "offer",
  offer: "offer",
  rejected: "rejected",
  withdrawn: "withdrawn",
  no_response: "no_response",
};

function dateValue(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function applicationCandidate(
  application: LegacyOpportunityApplication,
): LegacyJourneyCandidate | null {
  const state = APPLICATION_STATE[application.status.toLowerCase()];
  if (!state) return null;
  const appliedAt =
    state === "applied" || state === "interview" || STATE_STRENGTH[state] >= 8
      ? dateValue(application.submittedAt ?? application.updatedAt)
      : null;
  const closedAt = STATE_STRENGTH[state] >= 8
    ? dateValue(application.updatedAt ?? application.submittedAt)
    : null;

  return {
    source: "application",
    sourceId: application.id,
    opportunityId: application.opportunityId,
    state,
    appliedAt,
    closedAt,
    outcome: STATE_STRENGTH[state] >= 8 ? state : null,
  };
}

function bookmarkCandidate(
  bookmark: LegacyOpportunityBookmark,
): LegacyJourneyCandidate {
  return {
    source: "bookmark",
    sourceId: bookmark.id,
    opportunityId: bookmark.opportunityId,
    state: "shortlisted",
    appliedAt: null,
    closedAt: null,
    outcome: null,
  };
}

function selectLegacyCandidates(
  bookmarks: LegacyOpportunityBookmark[],
  applications: LegacyOpportunityApplication[],
): LegacyJourneyCandidate[] {
  const byOpportunity = new Map<string, LegacyJourneyCandidate>();
  for (const bookmark of bookmarks) {
    byOpportunity.set(bookmark.opportunityId, bookmarkCandidate(bookmark));
  }
  for (const application of applications) {
    const candidate = applicationCandidate(application);
    if (candidate) byOpportunity.set(candidate.opportunityId, candidate);
  }
  return [...byOpportunity.values()];
}

function patchFor(candidate: LegacyJourneyCandidate) {
  return {
    state: candidate.state,
    priority: "none" as const,
    ...(candidate.appliedAt ? { appliedAt: candidate.appliedAt } : {}),
    ...(candidate.closedAt ? { closedAt: candidate.closedAt } : {}),
    ...(candidate.outcome ? { outcome: candidate.outcome } : {}),
  };
}

function legacyApplicationStatus(state: OpportunityJourneyState): string | null {
  return {
    applied: "submitted",
    interview: "interviewing",
    offer: "offered",
    rejected: "rejected",
    withdrawn: "withdrawn",
    no_response: "no_response",
    expired: "withdrawn",
  }[state] ?? null;
}

@Injectable()
export class OpportunityJourneyCompatibilityService {
  constructor(
    private readonly repository: OpportunityJourneyOperationsRepository,
    private readonly legacyStore: OpportunityJourneyLegacyStore =
      new DatabaseOpportunityJourneyLegacyStore(),
  ) {}

  async reconcileUser(userId: string): Promise<{
    imported: number;
    updated: number;
    skipped: number;
    unsupported: number;
  }> {
    const [bookmarks, applications] = await Promise.all([
      this.legacyStore.listBookmarks(userId),
      this.legacyStore.listApplications(userId),
    ]);
    const candidates = selectLegacyCandidates(bookmarks, applications);
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let unsupported = applications.filter(
      (application) => !APPLICATION_STATE[application.status.toLowerCase()],
    ).length;

    for (const candidate of candidates) {
      const current = await this.repository.findJourneyByOpportunity(
        userId,
        candidate.opportunityId,
      );
      const idempotencyKey = `legacy-import-v1:${candidate.source}:${candidate.sourceId}`;

      if (!current) {
        await this.repository.createOrReadJourney({
          userId,
          opportunityId: candidate.opportunityId,
          state: candidate.state,
          priority: "none",
          idempotencyKey,
          eventType: "legacy_imported",
          source: "migration",
          metadata: {
            legacySource: candidate.source,
            legacySourceId: candidate.sourceId,
            appliedAt: candidate.appliedAt?.toISOString() ?? null,
            closedAt: candidate.closedAt?.toISOString() ?? null,
            outcome: candidate.outcome,
          },
        });
        imported += 1;
        continue;
      }

      if (STATE_STRENGTH[current.state] >= STATE_STRENGTH[candidate.state]) {
        skipped += 1;
        continue;
      }

      await this.repository.updateJourneyVersioned({
        userId,
        journeyId: current.id,
        expectedVersion: current.version,
        patch: patchFor(candidate),
        idempotencyKey,
        eventType: "legacy_imported",
        source: "migration",
        metadata: {
          legacySource: candidate.source,
          legacySourceId: candidate.sourceId,
        },
      });
      updated += 1;
    }

    return { imported, updated, skipped, unsupported };
  }

  async mirrorJourney(
    userId: string,
    journey: OpportunityJourney,
  ): Promise<void> {
    if (journey.state !== "archived") {
      await this.legacyStore.ensureBookmark(userId, {
        opportunityId: journey.opportunityId,
        priority:
          journey.priority === "primary"
            ? "high"
            : journey.priority === "secondary"
              ? "medium"
              : "low",
        notes: `Managed by Edutu opportunity path ${journey.id}`,
      });
    }

    const status = legacyApplicationStatus(journey.state);
    if (!status) return;

    await this.legacyStore.ensureApplication(userId, {
      opportunityId: journey.opportunityId,
      status,
      submittedAt: journey.appliedAt ?? new Date(),
      metadata: {
        journeyId: journey.id,
        opportunityJourneyState: journey.state,
        mirroredBy: "opportunity_pipeline",
      },
    });
  }

  async auditUserParity(userId: string): Promise<{
    userId: string;
    mismatches: Array<{
      opportunityId: string;
      expectedState: OpportunityJourneyState;
      actualState: OpportunityJourneyState | null;
      source: "bookmark" | "application";
    }>;
    legacyRecords: number;
    journeyRecords: number;
  }> {
    const [bookmarks, applications, journeys] = await Promise.all([
      this.legacyStore.listBookmarks(userId),
      this.legacyStore.listApplications(userId),
      this.repository.listJourneysForUser(userId),
    ]);
    const expected = selectLegacyCandidates(bookmarks, applications);
    const byOpportunity = new Map(
      journeys.map((journey) => [journey.opportunityId, journey]),
    );
    const mismatches = expected
      .map((candidate) => {
        const actual = byOpportunity.get(candidate.opportunityId);
        return actual?.state === candidate.state
          ? null
          : {
              opportunityId: candidate.opportunityId,
              expectedState: candidate.state,
              actualState: actual?.state ?? null,
              source: candidate.source,
            };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    return {
      userId,
      mismatches,
      legacyRecords: expected.length,
      journeyRecords: journeys.length,
    };
  }

  listLegacyUserIds(input?: { limit?: number; afterUserId?: string | null }) {
    return this.legacyStore.listUserIds(input);
  }
}
