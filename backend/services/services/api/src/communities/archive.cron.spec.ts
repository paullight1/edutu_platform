import { randomUUID } from "node:crypto";
import {
  ARCHIVE_BATCH_SIZE,
  ARCHIVE_MAX_BATCHES,
  CommunityArchiveCron,
  type ArchiveStore,
} from "./archive.cron";

type Row = {
  id: string;
  name: string;
  expiresAt: Date | null;
  archivedAt: Date | null;
};

/**
 * A real little table rather than a chain of jest mocks.
 *
 * The single most important assertion in this file is that no row ever
 * disappears, and a mocked query builder cannot make that assertion: it would
 * record the calls a delete made and report them as passes. So the double
 * stores rows in an array, applies the predicates itself, and the specs count
 * the array afterwards.
 */
class FakeArchiveStore implements ArchiveStore {
  rows: Row[] = [];
  reads = 0;
  writes = 0;
  /** Throws on the Nth write (1-based) to exercise a partial failure. */
  failWriteOnCall: number | null = null;
  failReads = false;

  add(row: Partial<Row> = {}): Row {
    const created: Row = {
      id: row.id ?? randomUUID(),
      name: row.name ?? "Group",
      expiresAt: row.expiresAt ?? null,
      archivedAt: row.archivedAt ?? null,
    };
    this.rows.push(created);
    return created;
  }

  async findExpiredUnarchivedIds(now: Date, limit: number): Promise<string[]> {
    this.reads += 1;
    if (this.failReads) throw new Error("read exploded");
    return this.rows
      .filter(
        (row) =>
          row.expiresAt !== null &&
          row.expiresAt.getTime() < now.getTime() &&
          row.archivedAt === null,
      )
      .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime())
      .slice(0, limit)
      .map((row) => row.id);
  }

  async markArchived(ids: string[], now: Date): Promise<number> {
    this.writes += 1;
    if (this.failWriteOnCall === this.writes) {
      throw new Error("write exploded");
    }
    let count = 0;
    for (const row of this.rows) {
      // The `archivedAt === null` re-check is the store's contract, so the
      // double honours it — otherwise the "already-archived timestamp does not
      // move" spec would be testing the double, not the sweep.
      if (ids.includes(row.id) && row.archivedAt === null) {
        row.archivedAt = now;
        count += 1;
      }
    }
    return count;
  }
}

const HOUR = 60 * 60 * 1000;

function makeCron(store: ArchiveStore) {
  const cron = new CommunityArchiveCron(store);
  // The sweep logs through Nest's Logger; silence it so a failing-batch spec
  // does not print a stack trace that reads like a test failure.
  const logger = (
    cron as unknown as {
      logger: Record<"log" | "warn" | "error", (...args: unknown[]) => void>;
    }
  ).logger;
  for (const level of ["log", "warn", "error"] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
  return cron;
}

describe("CommunityArchiveCron", () => {
  const now = new Date("2026-08-03T00:00:00.000Z");

  it("archives a group past its expiry rather than deleting it", async () => {
    const store = new FakeArchiveStore();
    const group = store.add({ expiresAt: new Date(now.getTime() - HOUR) });

    const result = await makeCron(store).runArchiveSweep(now);

    expect(result).toEqual({ archived: 1, batches: 1, incomplete: false });
    expect(group.archivedAt).toEqual(now);
    // The whole point of the feature: the room survives the deadline it was
    // about. If this ever fails because the sweep learned to DELETE, the
    // cohort's questions and answers went with it.
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].id).toBe(group.id);
  });

  it("leaves a group with no expiry alone", async () => {
    const store = new FakeArchiveStore();
    const evergreen = store.add({ expiresAt: null });

    const result = await makeCron(store).runArchiveSweep(now);

    expect(result.archived).toBe(0);
    expect(evergreen.archivedAt).toBeNull();
    expect(store.rows).toHaveLength(1);
  });

  it("leaves a group whose expiry has not arrived alone", async () => {
    const store = new FakeArchiveStore();
    const future = store.add({ expiresAt: new Date(now.getTime() + HOUR) });

    await makeCron(store).runArchiveSweep(now);

    expect(future.archivedAt).toBeNull();
    expect(store.rows).toHaveLength(1);
  });

  it("does not move an already-archived group's timestamp", async () => {
    const store = new FakeArchiveStore();
    const archivedAt = new Date("2026-03-01T09:30:00.000Z");
    const retired = store.add({
      expiresAt: new Date(now.getTime() - 90 * 24 * HOUR),
      archivedAt,
    });

    const result = await makeCron(store).runArchiveSweep(now);

    expect(result.archived).toBe(0);
    expect(retired.archivedAt).toBe(archivedAt);
    expect(store.rows).toHaveLength(1);
  });

  it("is idempotent: a second sweep changes nothing", async () => {
    const store = new FakeArchiveStore();
    const group = store.add({ expiresAt: new Date(now.getTime() - HOUR) });
    const cron = makeCron(store);

    await cron.runArchiveSweep(now);
    const stamped = group.archivedAt;

    const later = new Date(now.getTime() + 24 * HOUR);
    const second = await cron.runArchiveSweep(later);

    expect(second.archived).toBe(0);
    expect(group.archivedAt).toBe(stamped);
    expect(store.rows).toHaveLength(1);
  });

  it("sweeps a mixed table and touches only the expired, unarchived rows", async () => {
    const store = new FakeArchiveStore();
    const expired = store.add({ expiresAt: new Date(now.getTime() - HOUR) });
    const evergreen = store.add({ expiresAt: null });
    const future = store.add({ expiresAt: new Date(now.getTime() + HOUR) });
    const alreadyArchivedAt = new Date("2026-01-01T00:00:00.000Z");
    const already = store.add({
      expiresAt: new Date(now.getTime() - 2 * HOUR),
      archivedAt: alreadyArchivedAt,
    });

    const result = await makeCron(store).runArchiveSweep(now);

    expect(result.archived).toBe(1);
    expect(expired.archivedAt).toEqual(now);
    expect(evergreen.archivedAt).toBeNull();
    expect(future.archivedAt).toBeNull();
    expect(already.archivedAt).toBe(alreadyArchivedAt);
    expect(store.rows).toHaveLength(4);
  });

  it("pages through a backlog larger than one batch", async () => {
    const store = new FakeArchiveStore();
    const total = ARCHIVE_BATCH_SIZE + 7;
    for (let i = 0; i < total; i += 1) {
      store.add({ expiresAt: new Date(now.getTime() - (i + 1) * HOUR) });
    }

    const result = await makeCron(store).runArchiveSweep(now);

    expect(result.archived).toBe(total);
    expect(result.batches).toBe(2);
    expect(result.incomplete).toBe(false);
    expect(store.rows).toHaveLength(total);
    expect(store.rows.every((row) => row.archivedAt !== null)).toBe(true);
  });

  it("keeps committed batches and defers the rest when a batch fails", async () => {
    const store = new FakeArchiveStore();
    const total = ARCHIVE_BATCH_SIZE + 5;
    for (let i = 0; i < total; i += 1) {
      store.add({ expiresAt: new Date(now.getTime() - (i + 1) * HOUR) });
    }
    store.failWriteOnCall = 2;
    const cron = makeCron(store);

    const result = await cron.runArchiveSweep(now);

    // Stopped early, did not throw, did not roll the first batch back.
    expect(result.incomplete).toBe(true);
    expect(result.archived).toBe(ARCHIVE_BATCH_SIZE);
    expect(store.rows.filter((row) => row.archivedAt === null)).toHaveLength(5);
    expect(store.rows).toHaveLength(total);

    // The next run resumes: the predicate is a fixed point, so the survivors
    // are still selected and the stamped rows are not.
    store.failWriteOnCall = null;
    const resumed = await cron.runArchiveSweep(now);
    expect(resumed.archived).toBe(5);
    expect(resumed.incomplete).toBe(false);
    expect(store.rows.filter((row) => row.archivedAt === null)).toHaveLength(0);
    expect(store.rows).toHaveLength(total);
  });

  it("stops without throwing when the read fails", async () => {
    const store = new FakeArchiveStore();
    store.add({ expiresAt: new Date(now.getTime() - HOUR) });
    store.failReads = true;

    const result = await makeCron(store).runArchiveSweep(now);

    expect(result).toEqual({ archived: 0, batches: 0, incomplete: true });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].archivedAt).toBeNull();
  });

  it("never issues more than the per-run statement ceiling", async () => {
    // A store that always hands back the same live id: without the ceiling this
    // is an infinite loop inside a scheduler tick.
    const stuck: ArchiveStore = {
      findExpiredUnarchivedIds: async () => ["stuck"],
      markArchived: async () => 0,
    };

    const result = await makeCron(stuck).runArchiveSweep(now);

    expect(result.batches).toBe(ARCHIVE_MAX_BATCHES);
    expect(result.incomplete).toBe(true);
  });

  it("skips a tick while a previous sweep is still running", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: ArchiveStore = {
      findExpiredUnarchivedIds: async () => {
        await gate;
        return [];
      },
      markArchived: async () => 0,
    };
    const store = slow as ArchiveStore & { calls?: number };
    const spy = jest.spyOn(store, "findExpiredUnarchivedIds");
    const cron = makeCron(store);

    const first = cron.handleExpiredGroupSweep();
    await cron.handleExpiredGroupSweep();
    expect(spy).toHaveBeenCalledTimes(1);

    release!();
    await first;
  });
});
