import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { eventRegistrations, events, type Event } from "../db/schema";
import type { CreateEventDto, JoinEventDto, UpdateEventDto } from "./event.dto";

interface EventListQuery {
  limit?: number | string;
  offset?: number | string;
  status?: string;
  search?: string;
}

export interface SitemapEventEntry {
  slug: string;
  updatedAt: Date | string | null;
  startsAt: Date | string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EVENT_REGISTRATION_UNIQUE_CONSTRAINTS = new Set([
  "event_registrations_event_user_unique",
  "event_registrations_event_email_ci_unique",
]);

function toLimit(value: EventListQuery["limit"], fallback = 20): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function toOffset(value: EventListQuery["offset"]): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class EventsService {
  async findAll(query: EventListQuery = {}) {
    const status = query.status || "published";
    const limit = toLimit(query.limit);
    const offset = toOffset(query.offset);
    const conditions: SQL[] = [];

    if (status !== "all") {
      conditions.push(eq(events.status, status));
    }

    const search = query.search?.trim();
    if (search) {
      const searchCondition = or(
        sql`${events.title} ilike ${`%${search}%`}`,
        sql`${events.summary} ilike ${`%${search}%`}`,
        sql`${events.location} ilike ${`%${search}%`}`,
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    return db
      .select()
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(events.startsAt), desc(events.updatedAt))
      .limit(limit)
      .offset(offset)
      .execute();
  }

  async findAdminList(query: EventListQuery = {}) {
    const status = query.status || "all";
    const rows = await this.findAll({
      ...query,
      status,
      limit: toLimit(query.limit, 50),
    });

    return {
      data: rows,
      limit: toLimit(query.limit, 50),
      offset: toOffset(query.offset),
      total: rows.length,
    };
  }

  async findOnePublic(slugOrId: string) {
    const event = await this.findOne(slugOrId);
    if (!event || event.status !== "published") {
      throw new NotFoundException("Event not found");
    }

    return event;
  }

  async findOne(slugOrId: string): Promise<Event | null> {
    const rows = await db
      .select()
      .from(events)
      .where(this.eventLookupCondition(slugOrId))
      .limit(1)
      .execute();

    return rows[0] ?? null;
  }

  async create(dto: CreateEventDto, createdBy?: string) {
    this.assertDateRange(dto.startsAt, dto.endsAt);
    const slug = await this.resolveUniqueSlug(dto.slug || dto.title);
    const now = new Date();

    const rows = await db
      .insert(events)
      .values({
        title: dto.title,
        slug,
        summary: dto.summary,
        description: dto.description,
        startsAt: dto.startsAt,
        endsAt: asDate(dto.endsAt),
        timezone: dto.timezone,
        location: dto.location,
        isOnline: dto.isOnline,
        ctaLabel: dto.ctaLabel,
        ctaUrl: dto.ctaUrl,
        imageUrl: dto.imageUrl,
        status: dto.status,
        audience: dto.audience,
        capacity: dto.capacity ?? undefined,
        createdBy,
        metadata: dto.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .execute();

    return rows[0];
  }

  async update(id: string, dto: UpdateEventDto) {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException("Event not found");
    }

    this.assertDateRange(
      dto.startsAt ?? existing.startsAt,
      dto.endsAt === undefined ? existing.endsAt : dto.endsAt,
    );

    const updatePayload: Partial<typeof events.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.summary !== undefined) updatePayload.summary = dto.summary;
    if (dto.description !== undefined)
      updatePayload.description = dto.description;
    if (dto.startsAt !== undefined) updatePayload.startsAt = dto.startsAt;
    if (dto.endsAt !== undefined) updatePayload.endsAt = asDate(dto.endsAt);
    if (dto.timezone !== undefined) updatePayload.timezone = dto.timezone;
    if (dto.location !== undefined) updatePayload.location = dto.location;
    if (dto.isOnline !== undefined) updatePayload.isOnline = dto.isOnline;
    if (dto.ctaLabel !== undefined) updatePayload.ctaLabel = dto.ctaLabel;
    if (dto.ctaUrl !== undefined) updatePayload.ctaUrl = dto.ctaUrl;
    if (dto.imageUrl !== undefined) updatePayload.imageUrl = dto.imageUrl;
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.audience !== undefined) updatePayload.audience = dto.audience;
    if (dto.capacity !== undefined)
      updatePayload.capacity = dto.capacity ?? null;
    if (dto.metadata !== undefined) updatePayload.metadata = dto.metadata;
    if (dto.slug !== undefined) {
      updatePayload.slug = await this.resolveUniqueSlug(
        dto.slug || existing.title,
        id,
      );
    }

    const rows = await db
      .update(events)
      .set(updatePayload)
      .where(eq(events.id, existing.id))
      .returning()
      .execute();

    return rows[0];
  }

  async archive(id: string) {
    const event = await this.update(id, { status: "archived" });
    return { success: true, event };
  }

  async join(slugOrId: string, dto: JoinEventDto) {
    const userId = dto.userId?.trim() || undefined;
    const email = dto.email?.trim().toLowerCase() || undefined;
    const duplicateConditions: SQL[] = [];
    if (userId) duplicateConditions.push(eq(eventRegistrations.userId, userId));
    if (email) duplicateConditions.push(eq(eventRegistrations.email, email));
    const duplicateCondition = or(...duplicateConditions);

    // A public registration without a stable identity cannot be retried safely
    // and can be repeated indefinitely, so it cannot be counted as a seat.
    if (!duplicateCondition) {
      throw new BadRequestException(
        "Email or user ID is required to join this event.",
      );
    }

    try {
      return await db.transaction(async (tx) => {
        // The event row is the serialization point for its registrations. A
        // second join waits here, then sees the first registration in the
        // duplicate/capacity checks below instead of overselling the event.
        const eventRows = await tx
          .select()
          .from(events)
          .where(this.eventLookupCondition(slugOrId))
          .limit(1)
          .for("update")
          .execute();
        const event = eventRows[0];
        if (!event || event.status !== "published") {
          throw new NotFoundException("Event not found");
        }

        // Check idempotency before capacity so a learner who already has a
        // seat can safely retry after the event fills.
        const existing = await tx
          .select()
          .from(eventRegistrations)
          .where(
            and(eq(eventRegistrations.eventId, event.id), duplicateCondition),
          )
          .limit(1)
          .execute();
        if (existing[0]) {
          return {
            success: true,
            event,
            registration: existing[0],
            ctaUrl: event.ctaUrl,
          };
        }

        if (event.capacity !== null && event.capacity !== undefined) {
          const [{ count }] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(eventRegistrations)
            .where(eq(eventRegistrations.eventId, event.id))
            .execute();

          if (Number(count) >= event.capacity) {
            throw new BadRequestException("Event is at capacity");
          }
        }

        const rows = await tx
          .insert(eventRegistrations)
          .values({
            eventId: event.id,
            userId,
            name: dto.name,
            email,
            source: dto.source,
            metadata: dto.metadata,
          })
          .returning()
          .execute();

        return {
          success: true,
          event,
          registration: rows[0],
          ctaUrl: event.ctaUrl,
        };
      });
    } catch (error) {
      // The transaction lock handles normal races. The matching database
      // constraints below are a second line of defence for old deployments or
      // manual writes; turn their duplicate-key error into the same idempotent
      // response instead of exposing a 500 to the learner.
      if (!this.isRegistrationIdentityConflict(error)) throw error;

      const event = await this.findOnePublic(slugOrId);
      const existing = await db
        .select()
        .from(eventRegistrations)
        .where(
          and(eq(eventRegistrations.eventId, event.id), duplicateCondition),
        )
        .limit(1)
        .execute();
      if (!existing[0]) throw error;

      return {
        success: true,
        event,
        registration: existing[0],
        ctaUrl: event.ctaUrl,
      };
    }
  }

  async listSitemapEvents(limit = 5000): Promise<SitemapEventEntry[]> {
    try {
      const rows = await db
        .select({
          slug: events.slug,
          updatedAt: events.updatedAt,
          startsAt: events.startsAt,
        })
        .from(events)
        .where(eq(events.status, "published"))
        .orderBy(desc(events.updatedAt))
        .limit(Math.min(Math.max(Number(limit) || 5000, 1), 5000))
        .execute();

      return rows;
    } catch {
      return [];
    }
  }

  private async resolveUniqueSlug(value: string, currentEventId?: string) {
    const base = slugify(value) || "event";
    let candidate = base;
    let suffix = 2;

    while (await this.slugExists(candidate, currentEventId)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private async slugExists(slug: string, currentEventId?: string) {
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
      .execute();

    return Boolean(rows[0] && rows[0].id !== currentEventId);
  }

  private eventLookupCondition(slugOrId: string) {
    return UUID_PATTERN.test(slugOrId)
      ? or(eq(events.id, slugOrId), eq(events.slug, slugOrId))
      : eq(events.slug, slugOrId);
  }

  private isRegistrationIdentityConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const databaseError = error as { code?: unknown; constraint?: unknown };
    return (
      databaseError.code === "23505" &&
      typeof databaseError.constraint === "string" &&
      EVENT_REGISTRATION_UNIQUE_CONSTRAINTS.has(databaseError.constraint)
    );
  }

  private assertDateRange(
    startsAt: Date | string | null | undefined,
    endsAt?: Date | string | null,
  ) {
    const start = asDate(startsAt);
    const end = asDate(endsAt);

    if (!start) {
      throw new BadRequestException("Event start date is required");
    }

    if (end && end.getTime() < start.getTime()) {
      throw new BadRequestException(
        "Event end date cannot be before start date",
      );
    }
  }
}
