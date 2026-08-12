import { BadRequestException } from "@nestjs/common";
import { db } from "../db";
import { eventRegistrations, events } from "../db/schema";
import { EventsService } from "./events.service";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    transaction: jest.fn(),
  },
}));

type Registration = {
  id: string;
  eventId: string;
  userId?: string;
  name?: string;
  email?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  status: string;
  createdAt: Date;
};

/**
 * Minimal in-memory implementation of the Drizzle calls made by join(). It
 * serialises explicit transactions, but deliberately lets non-transactional
 * capacity reads rendezvous so the test can reproduce the production race.
 */
class EventJoinDatabase {
  readonly event = {
    id: "c5fd47da-1d84-4ca2-8be8-0ef82e1fcd4e",
    slug: "mentor-clinic",
    status: "published",
    capacity: 1,
    ctaUrl: "https://meet.google.com/mentor-clinic",
  };
  registrations: Registration[] = [];
  returnExistingRegistration = false;
  blockUnserializedCapacityReads = false;
  private transactionDepth = 0;
  private transactionTail = Promise.resolve();
  private unprotectedCapacityReads = 0;
  private releaseCapacityRead!: () => void;
  private readonly capacityReadGate = new Promise<void>((resolve) => {
    this.releaseCapacityRead = resolve;
  });

  readonly client = {
    select: jest.fn((fields?: Record<string, unknown>) => this.select(fields)),
    insert: jest.fn(() => this.insert()),
    transaction: jest.fn(
      async (callback: (tx: typeof this.client) => Promise<unknown>) => {
        const previous = this.transactionTail;
        let releaseTransaction!: () => void;
        this.transactionTail = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
        await previous;
        this.transactionDepth += 1;
        try {
          return await callback(this.client);
        } finally {
          this.transactionDepth -= 1;
          releaseTransaction();
        }
      },
    ),
  };

  private select(fields?: Record<string, unknown>) {
    let table: unknown;
    const query = {
      from: (source: unknown) => {
        table = source;
        return query;
      },
      where: () => query,
      limit: () => query,
      for: () => query,
      execute: async () => {
        if (table === events) return [this.event];
        if (table !== eventRegistrations) return [];

        if (fields) {
          // Without a transaction both callers see the pre-insert count. This
          // is the exact lost-seat race the service must prevent.
          if (
            this.blockUnserializedCapacityReads &&
            this.transactionDepth === 0
          ) {
            this.unprotectedCapacityReads += 1;
            if (this.unprotectedCapacityReads === 2) {
              this.releaseCapacityRead();
            }
            await this.capacityReadGate;
          }
          return [{ count: this.registrations.length }];
        }

        return this.returnExistingRegistration && this.registrations[0]
          ? [this.registrations[0]]
          : [];
      },
    };
    return query;
  }

  private insert() {
    let values: Omit<Registration, "id" | "status" | "createdAt">;
    const query = {
      values: (input: typeof values) => {
        values = input;
        return query;
      },
      returning: () => query,
      execute: async () => {
        const row: Registration = {
          id: `registration-${this.registrations.length + 1}`,
          eventId: values.eventId,
          userId: values.userId,
          name: values.name,
          email: values.email,
          source: values.source,
          metadata: values.metadata,
          status: "registered",
          createdAt: new Date(),
        };
        this.registrations.push(row);
        return [row];
      },
    };
    return query;
  }
}

const mockedDb = db as unknown as Record<string, unknown>;

describe("EventsService.join", () => {
  let service: EventsService;
  let database: EventJoinDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    database = new EventJoinDatabase();
    Object.assign(mockedDb, database.client);
    service = new EventsService();
  });

  it("rejects an anonymous public registration", async () => {
    await expect(service.join("mentor-clinic", {})).rejects.toThrow(
      new BadRequestException(
        "Email or user ID is required to join this event.",
      ),
    );

    expect(database.registrations).toHaveLength(0);
  });

  it("returns an existing registration before checking a full event", async () => {
    const existing: Registration = {
      id: "registration-existing",
      eventId: database.event.id,
      email: "learner@example.com",
      status: "registered",
      createdAt: new Date("2026-08-12T10:00:00.000Z"),
    };
    database.registrations.push(existing);
    database.returnExistingRegistration = true;

    const result = await service.join("mentor-clinic", {
      email: "learner@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.registration).toEqual(existing);
    expect(database.registrations).toEqual([existing]);
  });

  it("admits only one simultaneous registration for the final available seat", async () => {
    database.blockUnserializedCapacityReads = true;

    const attempts = await Promise.allSettled([
      service.join("mentor-clinic", { email: "first@example.com" }),
      service.join("mentor-clinic", { email: "second@example.com" }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    expect(database.registrations).toHaveLength(1);
    expect(
      attempts.find((attempt) => attempt.status === "rejected"),
    ).toMatchObject({
      reason: expect.objectContaining({ message: "Event is at capacity" }),
    });
  });
});
