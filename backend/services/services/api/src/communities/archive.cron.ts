import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, asc, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { communityGroups } from "../db/schema";

/**
 * The nightly close of expired groups.
 *
 * WHY THIS ARCHIVES AND NEVER DELETES
 * -----------------------------------
 * A group pinned to an opportunity inherits that opportunity's deadline, and
 * once the deadline passes the room has no live purpose — but it has the only
 * thing this feature exists to produce. The cohort that applied together left
 * behind the questions nobody could find answers to and the answers they found
 * anyway. Deleting the row at expiry would destroy exactly that artifact and
 * leave next year's applicants asking the same questions into an empty screen:
 * the "graveyard" outcome the whole design is arranged to avoid. So expiry
 * flips the room to READ-ONLY and nothing else. Every message stays fetchable,
 * every member keeps their history, and the group is simply no longer a place
 * you can post.
 *
 * IRREVERSIBLE, ON PURPOSE
 * ------------------------
 * There is no unarchive here, and none in `GroupsService` either. That is a
 * scope decision rather than a hard problem — see `GroupsService.archive` —
 * and it must stay consistent between the two, because a sweep that could be
 * undone while an owner's manual archive could not would be the same word
 * meaning two things.
 *
 * WHAT IT REFUSES TO TOUCH
 * ------------------------
 *   • A group with no `expires_at` is never swept. An unpinned group has no
 *     deadline to outlive; it closes when its owner says so.
 *   • A group that is already archived is never re-stamped. The `archived_at`
 *     of a group its owner retired in March must still read March in December,
 *     so the update carries `archived_at is null` in its own WHERE clause and
 *     not merely in the selection that fed it.
 */

/**
 * How many groups one UPDATE statement claims. Small enough that the row locks
 * it takes are never held long against a live chat screen's reads; large enough
 * that a normal night is one or two statements.
 */
export const ARCHIVE_BATCH_SIZE = 200;

/**
 * A ceiling on statements per run, so a pathological backlog (or a store bug
 * that keeps handing back the same ids) can never spin forever inside a
 * scheduler tick. Anything beyond it waits for tomorrow — see `runArchiveSweep`
 * on why deferring is safe.
 */
export const ARCHIVE_MAX_BATCHES = 50;

export type ArchiveSweepResult = {
  /** Rows actually stamped this run. */
  archived: number;
  /** UPDATE statements issued. */
  batches: number;
  /** True when a batch threw and the run stopped early. */
  incomplete: boolean;
};

/**
 * The persistence boundary, mirroring `GroupsStore`: the sweep depends on this
 * rather than on Drizzle, so its spec can hand it a real in-memory table. A
 * spec that mocked the query-builder chain call-by-call would pass just as
 * happily against a sweep that deleted rows, which is the one thing this file
 * exists to prevent.
 */
export interface ArchiveStore {
  /**
   * Ids of groups whose `expires_at` is set, has passed, and which are not yet
   * archived. Oldest expiry first, so a backlog drains in the order it built.
   */
  findExpiredUnarchivedIds(now: Date, limit: number): Promise<string[]>;
  /**
   * Stamp `archived_at = now` on those of `ids` that are STILL unarchived, and
   * return how many rows that was. The re-check is not redundant with the
   * selection above: an owner can archive a group by hand between the read and
   * the write, and overwriting their timestamp with the sweep's would silently
   * move a fact somebody else recorded.
   */
  markArchived(ids: string[], now: Date): Promise<number>;
}

export const ARCHIVE_STORE = Symbol("ARCHIVE_STORE");

export class DrizzleArchiveStore implements ArchiveStore {
  async findExpiredUnarchivedIds(now: Date, limit: number): Promise<string[]> {
    const rows = await db
      .select({ id: communityGroups.id })
      .from(communityGroups)
      .where(
        and(
          // `isNotNull` first and explicitly: `expires_at < now` is already
          // false for NULL in SQL, but stating the rule makes the "a group with
          // no deadline is never swept" guarantee readable in the query rather
          // than implied by three-valued logic.
          isNotNull(communityGroups.expiresAt),
          lt(communityGroups.expiresAt, now),
          isNull(communityGroups.archivedAt),
        ),
      )
      .orderBy(asc(communityGroups.expiresAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async markArchived(ids: string[], now: Date): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await db
      .update(communityGroups)
      .set({ archivedAt: now })
      .where(
        and(
          inArray(communityGroups.id, ids),
          isNull(communityGroups.archivedAt),
        ),
      )
      .returning({ id: communityGroups.id });
    return rows.length;
  }
}

@Injectable()
export class CommunityArchiveCron {
  private readonly logger = new Logger(CommunityArchiveCron.name);
  private readonly store: ArchiveStore;
  /** Guards against a slow run overlapping the next tick. */
  private running = false;

  constructor(@Optional() @Inject(ARCHIVE_STORE) store?: ArchiveStore) {
    this.store = store ?? new DrizzleArchiveStore();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredGroupSweep(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        "Community archive sweep is still running; skipping this tick",
      );
      return;
    }
    this.running = true;
    try {
      const result = await this.runArchiveSweep();
      this.logger.log(
        `Community archive sweep: archived ${result.archived} expired group(s) in ${result.batches} batch(es)${
          result.incomplete ? " (stopped early, resumes tomorrow)" : ""
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * ON PARTIAL FAILURE: a batch that throws ends the run. Batches already
   * committed stay committed, the remainder is left exactly as it was, and
   * nothing is rolled back.
   *
   * That is safe because the sweep is a fixed point, not a pipeline: the
   * selection is "expired and not archived", so every group the failed run
   * missed is still selected by the next one, and every group it did stamp is
   * no longer selected by anything. Re-running is therefore a no-op on the work
   * already done — which is also why this never rethrows. A rejected promise
   * out of a `@Cron` handler is an unhandled rejection in the scheduler, and
   * the alternative (retrying the failed batch in-loop) risks hammering a
   * database that is failing for a reason. Twenty-four hours late is the right
   * cost for an operation whose entire effect is making a room read-only.
   */
  async runArchiveSweep(now: Date = new Date()): Promise<ArchiveSweepResult> {
    let archived = 0;
    let batches = 0;

    for (let batch = 0; batch < ARCHIVE_MAX_BATCHES; batch += 1) {
      let ids: string[];
      try {
        ids = await this.store.findExpiredUnarchivedIds(
          now,
          ARCHIVE_BATCH_SIZE,
        );
      } catch (error) {
        this.logger.error("Community archive sweep: read failed", error);
        return { archived, batches, incomplete: true };
      }

      if (ids.length === 0) {
        return { archived, batches, incomplete: false };
      }

      try {
        archived += await this.store.markArchived(ids, now);
        batches += 1;
      } catch (error) {
        this.logger.error(
          `Community archive sweep: batch of ${ids.length} failed`,
          error,
        );
        return { archived, batches, incomplete: true };
      }
    }

    // Hit the statement ceiling with work still outstanding.
    return { archived, batches, incomplete: true };
  }
}
