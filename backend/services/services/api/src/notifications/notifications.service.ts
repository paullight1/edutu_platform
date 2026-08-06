import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import axios from "axios";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "../db";
import {
  notificationPreferences,
  notificationPushTokens,
  notificationQueue,
  notifications,
  profiles,
} from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import { deferForQuietHours, type QuietHours } from "../common/quiet-hours";
import type {
  BroadcastNotificationDto,
  NotificationPreferencesDto,
  RegisterPushTokenDto,
} from "./dto/notification.dto";

const DEFAULT_CHANNELS = {
  inApp: true,
  push: true,
  email: false,
};

const BROADCAST_BATCH_SIZE = 500;

/**
 * Global per-user push budget.
 *
 * Every sender (deadline reminders, doc nudges, saved-search digests, goal and
 * roadmap reminders, pro-expiry notices, the alerts engine) used to cap itself
 * in isolation and could not see the others, so a user could be interrupted an
 * unbounded number of times a day by senders that each believed they were being
 * conservative. The budget lives at the single chokepoint every push funnels
 * through — `deliverBroadcast` — so new senders inherit it by construction.
 */
const PUSH_BUDGET_ROUTINE_PER_DAY = 1;
const PUSH_BUDGET_URGENT_PER_DAY = 2;
const PUSH_BUDGET_PER_WEEK = 5;

// Brevo caps `messageVersions` (individual per-recipient copies) at 1000 per
// /v3/smtp/email call; larger audiences are sent in successive calls.
const BREVO_VERSION_LIMIT = 1000;

/**
 * Maps a notification `kind` to the per-topic preference that mutes it. Kinds
 * absent from this map (e.g. "admin-broadcast" and transactional notices like
 * a creator application result) have no topic switch of their own and are
 * governed by the `pushNotifications` master switch alone.
 */
const TOPIC_PREFERENCE_BY_KIND: Record<string, keyof typeof TOPIC_COLUMNS> = {
  "opportunity-alert": "opportunityAlerts",
  "deadline-reminder": "deadlineReminders",
  "goal-reminder": "goalReminders",
  achievement: "achievementCelebrations",
};

const TOPIC_COLUMNS = {
  opportunityAlerts: true,
  deadlineReminders: true,
  goalReminders: true,
  achievementCelebrations: true,
};

type BroadcastRecipient = {
  userId: string;
  email: string | null;
  fullName: string | null;
};

/** A user's delivery-relevant preferences, resolved once per broadcast. */
type DeliveryPreferences = {
  pushNotifications: boolean;
  emailNotifications: boolean;
  opportunityAlerts: boolean;
  deadlineReminders: boolean;
  goalReminders: boolean;
  achievementCelebrations: boolean;
  quietHours: QuietHours;
  timezone: string | null;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = new Expo();
  // Lazily-loaded web-push module (optional dependency); null when VAPID keys
  // are unset or the package isn't installed, in which case web push no-ops.
  private webpush: any = null;
  private webpushChecked = false;

  private getWebpush(): any | null {
    if (this.webpushChecked) return this.webpush;
    this.webpushChecked = true;

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      this.logger.warn("Web push disabled: VAPID keys not configured");
      return null;
    }

    try {
      // require (not import) so the build stays green without the package.

      const webpush = require("web-push");
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || "mailto:support@edutu.org",
        publicKey,
        privateKey,
      );
      this.webpush = webpush;
      return webpush;
    } catch {
      this.logger.warn("Web push disabled: web-push package not installed");
      return null;
    }
  }

  async listForUser(userId: string, limit = 30, cursor?: string) {
    const dbUserId = toDatabaseUserId(userId);
    const cappedLimit = Math.min(Number(limit) || 30, 100);
    const conditions = [eq(notifications.userId, dbUserId)];

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        conditions.push(lte(notifications.createdAt, cursorDate));
      }
    }

    try {
      return await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(cappedLimit);
    } catch (error) {
      this.logger.warn(
        `Notification list unavailable for ${dbUserId}: ${this.errorMessage(error)}`,
      );
      return [];
    }
  }

  async getSummary(userId: string, limit = 5) {
    const dbUserId = toDatabaseUserId(userId);
    const cappedLimit = Math.min(Number(limit) || 5, 20);

    const [totalResult, unreadResult, recent] = await Promise.all([
      db
        .select({ count: count() })
        .from(notifications)
        .where(eq(notifications.userId, dbUserId)),
      db
        .select({ count: count() })
        .from(notifications)
        .where(
          and(eq(notifications.userId, dbUserId), isNull(notifications.readAt)),
        ),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, dbUserId))
        .orderBy(desc(notifications.createdAt))
        .limit(cappedLimit),
    ]);

    return {
      totalCount: totalResult[0]?.count ?? 0,
      unreadCount: unreadResult[0]?.count ?? 0,
      recent,
      generatedAt: new Date().toISOString(),
    };
  }

  async markRead(userId: string, notificationId: string, read = true) {
    const dbUserId = toDatabaseUserId(userId);
    const [updated] = await db
      .update(notifications)
      .set({ readAt: read ? new Date() : null })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, dbUserId),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundException("Notification not found");
    return updated;
  }

  /**
   * Stamps `opened_at` for a notification the user tapped. Idempotent (the
   * FIRST open is the interesting one; a re-open must not move the timestamp)
   * and deliberately silent — see the controller for why this runs unauthed.
   * Never throws: telemetry must not surface an error to a client that is only
   * reporting a tap.
   */
  async markOpened(notificationId: string): Promise<void> {
    if (!notificationId?.trim()) return;
    try {
      await db
        .update(notifications)
        .set({ openedAt: new Date() })
        .where(
          and(
            eq(notifications.id, notificationId),
            isNull(notifications.openedAt),
          ),
        );
    } catch (error) {
      // An invalid uuid raises a cast error — that is a malformed id, not an
      // outage, and the caller gets 204 either way.
      this.logger.debug(
        `markOpened ignored for ${notificationId}: ${this.errorMessage(error)}`,
      );
    }
  }

  async markAllRead(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, dbUserId), isNull(notifications.readAt)),
      );

    return { success: true };
  }

  async deleteForUser(userId: string, notificationId: string) {
    const dbUserId = toDatabaseUserId(userId);
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, dbUserId),
        ),
      );

    return { success: true };
  }

  async getPreferences(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    try {
      const [prefs] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, dbUserId));

      return prefs || this.defaultPreferences(dbUserId);
    } catch (error) {
      this.logger.warn(
        `Notification preferences unavailable for ${dbUserId}: ${this.errorMessage(error)}`,
      );
      return this.defaultPreferences(dbUserId);
    }
  }

  private defaultPreferences(userId: string) {
    return {
      userId,
      pushNotifications: true,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: true,
      achievementCelebrations: true,
      weeklyDigest: false,
      marketingEmails: false,
      quietHours: { start: "22:00", end: "08:00" },
      updatedAt: new Date(),
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  async savePreferences(userId: string, dto: NotificationPreferencesDto) {
    const dbUserId = toDatabaseUserId(userId);
    const [saved] = await db
      .insert(notificationPreferences)
      .values({
        userId: dbUserId,
        ...dto,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          ...dto,
          updatedAt: new Date(),
        },
      })
      .returning();

    return saved;
  }

  async registerPushToken(userId: string, dto: RegisterPushTokenDto) {
    if (!dto.token?.trim()) {
      throw new BadRequestException("Push token is required");
    }

    const dbUserId = toDatabaseUserId(userId);
    const token = dto.token.trim();

    const existing = await db
      .select()
      .from(notificationPushTokens)
      .where(
        and(
          eq(notificationPushTokens.userId, dbUserId),
          eq(notificationPushTokens.token, token),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(notificationPushTokens)
        .set({
          provider: dto.provider || existing[0].provider || "expo",
          device: dto.device || existing[0].device || {},
          lastSeenAt: new Date(),
        })
        .where(eq(notificationPushTokens.id, existing[0].id))
        .returning();

      return updated;
    }

    const [created] = await db
      .insert(notificationPushTokens)
      .values({
        userId: dbUserId,
        provider: dto.provider || "expo",
        token,
        device: dto.device || {},
        lastSeenAt: new Date(),
      })
      .returning();

    return created;
  }

  async unregisterPushToken(userId: string, token: string) {
    const dbUserId = toDatabaseUserId(userId);
    await db
      .delete(notificationPushTokens)
      .where(
        and(
          eq(notificationPushTokens.userId, dbUserId),
          eq(notificationPushTokens.token, token),
        ),
      );

    return { success: true };
  }

  async replaceScheduledUserNotifications(
    userId: string,
    dedupePrefix: string,
    notificationsToSchedule: BroadcastNotificationDto[],
  ) {
    const dbUserId = toDatabaseUserId(userId);

    await db
      .delete(notificationQueue)
      .where(
        and(
          eq(notificationQueue.status, "pending"),
          sql`${notificationQueue.payload}->'metadata'->>'userId' = ${dbUserId}`,
          sql`${notificationQueue.payload}->'metadata'->>'dedupePrefix' = ${dedupePrefix}`,
        ),
      );

    const now = Date.now();
    const rows = notificationsToSchedule
      .map((item) => ({
        item,
        scheduledFor: item.scheduledFor ? new Date(item.scheduledFor) : null,
      }))
      .filter(
        (
          entry,
        ): entry is { item: BroadcastNotificationDto; scheduledFor: Date } =>
          Boolean(
            entry.scheduledFor &&
            !Number.isNaN(entry.scheduledFor.getTime()) &&
            entry.scheduledFor.getTime() > now + 30_000,
          ),
      );

    if (!rows.length) {
      return { scheduled: 0 };
    }

    await db.insert(notificationQueue).values(
      rows.map(({ item, scheduledFor }) => ({
        payload: {
          ...item,
          audience: "specific",
          targetUserIds: [dbUserId],
          channels: {
            inApp: true,
            push: true,
            email: false,
            ...(item.channels || {}),
          },
          metadata: {
            ...(item.metadata || {}),
            userId: dbUserId,
            dedupePrefix,
          },
        },
        scheduledFor,
        createdBy: dbUserId,
      })),
    );

    return { scheduled: rows.length };
  }

  async broadcast(adminUserId: string, dto: BroadcastNotificationDto) {
    this.validateBroadcast(dto);

    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    if (scheduledFor && scheduledFor.getTime() > Date.now() + 30_000) {
      const [queued] = await db
        .insert(notificationQueue)
        .values({
          payload: dto as unknown as Record<string, unknown>,
          scheduledFor,
          createdBy: toDatabaseUserId(adminUserId),
        })
        .returning();

      return {
        queued: true,
        id: queued.id,
        scheduledFor: queued.scheduledFor,
      };
    }

    const result = await this.deliverBroadcast(dto);

    // Audit trail: immediate broadcasts previously left no record anywhere.
    // Record them in notification_queue as already-processed "sent" rows so
    // the admin history shows every broadcast with its delivery summary.
    // Best-effort — a delivered broadcast must not fail because logging did.
    try {
      const now = new Date();
      await db.insert(notificationQueue).values({
        payload: dto as unknown as Record<string, unknown>,
        scheduledFor: now,
        status: "sent",
        processedAt: now,
        result: result as unknown as Record<string, unknown>,
        createdBy: toDatabaseUserId(adminUserId),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record broadcast history: ${this.errorMessage(error)}`,
      );
    }

    return result;
  }

  /** Cancels a still-pending scheduled broadcast. Processed rows are history. */
  async cancelQueuedBroadcast(id: string) {
    const [deleted] = await db
      .delete(notificationQueue)
      .where(
        and(
          eq(notificationQueue.id, id),
          eq(notificationQueue.status, "pending"),
        ),
      )
      .returning({ id: notificationQueue.id });

    if (!deleted) {
      throw new NotFoundException("Pending scheduled notification not found");
    }
    return { success: true, id: deleted.id };
  }

  async listQueue(limit = 50) {
    return db
      .select()
      .from(notificationQueue)
      .orderBy(desc(notificationQueue.createdAt))
      .limit(Math.min(Number(limit) || 50, 100));
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueQueue() {
    if (process.env.NOTIFICATION_SCHEDULER_ENABLED === "false") {
      return;
    }

    const dueItems = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.status, "pending"),
          lte(notificationQueue.scheduledFor, new Date()),
        ),
      )
      .limit(20);

    let processed = 0;

    for (const item of dueItems) {
      const [claimed] = await db
        .update(notificationQueue)
        .set({ status: "processing" })
        .where(
          and(
            eq(notificationQueue.id, item.id),
            eq(notificationQueue.status, "pending"),
          ),
        )
        .returning();

      if (!claimed) continue;
      processed += 1;

      try {
        const result = await this.deliverBroadcast(
          claimed.payload as unknown as BroadcastNotificationDto,
        );
        await db
          .update(notificationQueue)
          .set({
            status: "completed",
            processedAt: new Date(),
            result: result as Record<string, unknown>,
          })
          .where(eq(notificationQueue.id, claimed.id));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Notification queue failed";
        this.logger.error(message);
        await db
          .update(notificationQueue)
          .set({
            status: "failed",
            processedAt: new Date(),
            result: { error: message },
          })
          .where(eq(notificationQueue.id, claimed.id));
      }
    }

    return { processed };
  }

  private validateBroadcast(dto: BroadcastNotificationDto) {
    if (!dto.title?.trim()) throw new BadRequestException("Title is required");
    if (!dto.body?.trim()) throw new BadRequestException("Body is required");

    if (dto.scheduledFor) {
      const scheduledFor = new Date(dto.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) {
        throw new BadRequestException("scheduledFor must be a valid date");
      }
    }

    if (dto.audience === "specific" && !dto.targetUserIds?.length) {
      throw new BadRequestException("Select at least one target user");
    }
  }

  /**
   * Normalises a raw `db.execute` result into a row array.
   *
   * The node-postgres driver resolves `.execute()` to a pg `QueryResult`
   * ({ rows, rowCount, ... }) which is NOT iterable, while the postgres-js
   * driver resolves to a plain array. Iterating the result directly therefore
   * throws "result is not iterable" against node-postgres — handle both shapes.
   */
  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] } | null)?.rows ?? [];
  }

  /**
   * Resolves delivery preferences + timezone for a batch of users.
   *
   * Users with no `notification_preferences` row fall back to the column
   * defaults (push on, topics on, quiet hours 22:00–08:00) so behaviour matches
   * what the settings screen shows before it has ever been saved.
   *
   * The `profiles` join is dual-keyed because `profiles.user_id` is text that
   * may hold either the raw auth subject (the canonical write key, which is
   * what the mobile app stamps the timezone onto) or the derived uuid written
   * by older backend paths. Matching only one representation reads a stale row
   * and evaluates quiet hours in the wrong timezone. Preferring the most
   * recently updated non-null timezone keeps travellers correct.
   */
  private async loadDeliveryPreferences(
    userIds: string[],
  ): Promise<Map<string, DeliveryPreferences>> {
    const prefs = new Map<string, DeliveryPreferences>();
    if (!userIds.length) return prefs;

    for (const batch of this.chunk(userIds, BROADCAST_BATCH_SIZE)) {
      const result = await db.execute(sql`
        select u.user_id                                  as user_id,
               coalesce(p.push_notifications, true)       as push_notifications,
               coalesce(p.email_notifications, false)     as email_notifications,
               coalesce(p.opportunity_alerts, true)       as opportunity_alerts,
               coalesce(p.deadline_reminders, true)       as deadline_reminders,
               coalesce(p.goal_reminders, true)           as goal_reminders,
               coalesce(p.achievement_celebrations, true) as achievement_celebrations,
               p.quiet_hours                              as quiet_hours,
               (
                 select pr.timezone
                 from profiles pr
                 where (pr.user_id = u.user_id::text
                        or public.clerk_id_to_uuid(pr.user_id)::text = u.user_id::text)
                   and pr.timezone is not null
                 order by pr.updated_at desc nulls last
                 limit 1
               )                                          as timezone
        from unnest(array[${sql.join(
          batch.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[]) as u(user_id)
        left join notification_preferences p on p.user_id = u.user_id
      `);

      for (const row of this.rows<{
        user_id: string;
        push_notifications: boolean;
        email_notifications: boolean;
        opportunity_alerts: boolean;
        deadline_reminders: boolean;
        goal_reminders: boolean;
        achievement_celebrations: boolean;
        quiet_hours: QuietHours;
        timezone: string | null;
      }>(result)) {
        prefs.set(row.user_id, {
          pushNotifications: row.push_notifications,
          emailNotifications: row.email_notifications,
          opportunityAlerts: row.opportunity_alerts,
          deadlineReminders: row.deadline_reminders,
          goalReminders: row.goal_reminders,
          achievementCelebrations: row.achievement_celebrations,
          quietHours: row.quiet_hours ?? null,
          timezone: row.timezone,
        });
      }
    }

    return prefs;
  }

  /** Whether `kind` may be pushed to this user (master switch + topic switch). */
  private allowsPush(
    prefs: DeliveryPreferences | undefined,
    kind: string | undefined,
  ): boolean {
    if (!prefs) return true; // No row: column defaults allow push.
    if (!prefs.pushNotifications) return false;
    const topic = TOPIC_PREFERENCE_BY_KIND[kind || ""];
    return topic ? prefs[topic] : true;
  }

  /**
   * Whether this notification is allowed the raised daily ceiling.
   *
   * "Urgent" is deliberately narrow: an explicit critical severity, or a
   * deadline that is today/tomorrow. Everything else is routine, including
   * things that feel important to the sender.
   */
  private isUrgentNotification(dto: BroadcastNotificationDto): boolean {
    if (dto.severity === "critical") return true;
    const daysLeft = Number((dto.metadata as any)?.daysLeft);
    return Number.isFinite(daysLeft) && daysLeft <= 1;
  }

  /**
   * Counts pushes each user has ACTUALLY received in the rolling 24h/7d windows.
   *
   * Counted from `delivered_at`, never `created_at`: an inbox row that no
   * transport ever accepted did not interrupt anyone, and charging it against
   * the budget would silence users for notifications they never saw.
   *
   * One batched query for the whole recipient list — a per-recipient query
   * would be N round-trips on a broadcast.
   */
  private async loadPushBudgetUsage(
    userIds: string[],
  ): Promise<Map<string, { day: number; week: number }>> {
    const usage = new Map<string, { day: number; week: number }>();
    if (!userIds.length) return usage;

    for (const batch of this.chunk(userIds, BROADCAST_BATCH_SIZE)) {
      const result = await db.execute(sql`
        select n.user_id                                     as user_id,
               count(*) filter (
                 where n.delivered_at >= now() - interval '24 hours'
               )                                             as day_count,
               count(*)                                      as week_count
        from notifications n
        where n.user_id = any(array[${sql.join(
          batch.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[])
          and n.delivered_at is not null
          and n.delivered_at >= now() - interval '7 days'
        group by n.user_id
      `);

      // `db.execute` resolves to a pg QueryResult OBJECT under node-postgres,
      // which is not iterable — always unwrap through rows().
      for (const row of this.rows<{
        user_id: string;
        day_count: number | string;
        week_count: number | string;
      }>(result)) {
        usage.set(row.user_id, {
          day: Number(row.day_count) || 0,
          week: Number(row.week_count) || 0,
        });
      }
    }

    return usage;
  }

  /**
   * Drops recipients who are over their push budget. Applies to the PUSH
   * channel only — the in-app inbox row is not an interruption and email has
   * its own consent model — and reports the drop count so the behaviour is
   * observable rather than invisible.
   *
   * FAILS OPEN: if the counting query throws, everyone is let through. Muting
   * the product because a counting query failed is exactly the failure mode
   * this workstream exists to eliminate.
   */
  private async filterByPushBudget(
    recipients: BroadcastRecipient[],
    dto: BroadcastNotificationDto,
  ): Promise<{ allowed: BroadcastRecipient[]; suppressed: number }> {
    const unchanged = { allowed: recipients, suppressed: 0 };
    if (!recipients.length) return unchanged;
    if (process.env.NOTIFICATION_BUDGET_ENABLED === "false") return unchanged;

    // Two classes of notification bypass fatigue accounting.
    //
    // 1. A real operator broadcast (outage, policy change, launch) must reach
    //    everyone. Note this checks `dto.kind` EXPLICITLY rather than the
    //    `dto.kind || "admin-broadcast"` fallback used elsewhere in this file,
    //    and additionally requires a non-`specific` audience. Otherwise any
    //    internal sender that simply forgot to set `kind` would inherit an
    //    unlimited push budget — a silent footgun pointing the wrong way. An
    //    unset kind on a targeted send is budgeted, which is the safe default.
    // 2. Transactional notices the user paid for or must act on (`system` —
    //    e.g. Pro expiry). Dropping "your subscription expires tomorrow"
    //    because two opportunity alerts already went out is indefensible.
    const isOperatorBroadcast =
      dto.kind === "admin-broadcast" && dto.audience !== "specific";
    if (isOperatorBroadcast || dto.kind === "system") return unchanged;

    let usage: Map<string, { day: number; week: number }>;
    try {
      usage = await this.loadPushBudgetUsage(
        recipients.map((recipient) => recipient.userId),
      );
    } catch (error) {
      this.logger.warn(
        `Push budget lookup failed; delivering without a budget check: ${this.errorMessage(error)}`,
      );
      return unchanged;
    }

    const dailyCap = this.isUrgentNotification(dto)
      ? PUSH_BUDGET_URGENT_PER_DAY
      : PUSH_BUDGET_ROUTINE_PER_DAY;

    const allowed = recipients.filter((recipient) => {
      const used = usage.get(recipient.userId);
      if (!used) return true;
      return used.day < dailyCap && used.week < PUSH_BUDGET_PER_WEEK;
    });

    return { allowed, suppressed: recipients.length - allowed.length };
  }

  private async deliverBroadcast(dto: BroadcastNotificationDto) {
    const channels = { ...DEFAULT_CHANNELS, ...(dto.channels || {}) };
    let recipients = await this.resolveRecipients(dto);

    if (!recipients.length) {
      return {
        queued: false,
        recipientCount: 0,
        insertedCount: 0,
        push: { sent: 0, skipped: "no recipients" },
        email: { sent: 0, skipped: "no recipients" },
      };
    }

    const notificationIds: string[] = [];
    let insertedCount = 0;
    // Recipients whose in-app row was actually written this call. With a
    // dedupeKey set, a conflict means "we already told this user this" — see
    // the push-suppression note below.
    const insertedUserIds = new Set<string>();
    // userId -> the inbox row this send corresponds to. Threaded into the push
    // payload as `notificationId` so a tap can be attributed back to the row
    // (POST /notifications/:id/opened), which is what makes per-kind open rate
    // — and therefore fatigue suppression — computable at all.
    const notificationIdByUser = new Map<string, string>();

    if (channels.inApp) {
      for (const batch of this.chunk(recipients, BROADCAST_BATCH_SIZE)) {
        const rows = await db
          .insert(notifications)
          .values(
            batch.map((recipient) => ({
              userId: recipient.userId,
              kind: dto.kind || "admin-broadcast",
              title: dto.title.trim(),
              body: dto.body.trim(),
              severity: dto.severity || "info",
              metadata: dto.metadata || {},
              dedupeKey: dto.dedupeKey || null,
              channelStatus: {
                inApp: "delivered",
                push: channels.push ? "pending" : "disabled",
                email: channels.email ? "pending" : "disabled",
              },
            })),
          )
          // Required by the partial unique index on (user_id, dedupe_key).
          // Without this a repeated dedupeKey raises a unique violation that
          // aborts the WHOLE batch — turning a silent duplicate into a hard
          // failure for every other recipient in the chunk.
          .onConflictDoNothing()
          .returning({ id: notifications.id, userId: notifications.userId });

        insertedCount += rows.length;
        for (const row of rows) {
          notificationIds.push(row.id);
          insertedUserIds.add(row.userId);
          notificationIdByUser.set(row.userId, row.id);
        }
      }
    }

    // Dedupe must suppress the interruption, not just the inbox row. When a
    // dedupeKey is in play and the in-app write conflicted, this user has
    // already been told — pushing again is the duplicate we are trying to
    // prevent. Only applies when we actually wrote the inbox rows: the
    // quiet-hours redelivery path sets inApp:false deliberately (its row was
    // written by the original broadcast) and must still reach every recipient.
    if (channels.inApp && dto.dedupeKey) {
      recipients = recipients.filter((recipient) =>
        insertedUserIds.has(recipient.userId),
      );
      if (!recipients.length) {
        return {
          queued: false,
          recipientCount: 0,
          insertedCount,
          push: { sent: 0, skipped: "duplicate (dedupeKey already delivered)" },
          email: {
            sent: 0,
            skipped: "duplicate (dedupeKey already delivered)",
          },
        };
      }
    }

    // Preferences are enforced HERE rather than in each caller: every push in
    // the app funnels through this method, so honouring the user's settings
    // once means new senders inherit it instead of having to remember. In-app
    // rows above are deliberately unfiltered — the inbox is not an interruption.
    //
    // This lookup FAILS OPEN FOR PUSH: an empty map means
    // `allowsPush(undefined, kind)` returns true, so every recipient falls back
    // to the permissive column defaults and still gets their notification. A
    // preferences outage must not silence the product — that is exactly what
    // "result is not iterable" did in production, muting every push in the app.
    // At worst one broadcast ignores a push opt-out; the switch is re-read on
    // the next send.
    //
    // Email FAILS CLOSED. Sending marketing/notification email to someone who
    // opted out is a compliance breach, not a UX annoyance, and it cannot be
    // taken back once delivered. An unknown email preference is treated as "no".
    let prefs = new Map<string, DeliveryPreferences>();
    let prefsLookupFailed = false;
    if (channels.push || channels.email) {
      try {
        prefs = await this.loadDeliveryPreferences(
          recipients.map((r) => r.userId),
        );
      } catch (error) {
        prefsLookupFailed = true;
        this.logger.error(
          `Delivery preference lookup failed; push falls back to permissive defaults, email suppressed: ${this.errorMessage(error)}`,
        );
        prefs = new Map<string, DeliveryPreferences>();
      }
    }

    // Users a transport actually accepted the message for. Only these get a
    // `delivered_at` stamp — "we inserted a row" is not delivery, and treating
    // it as such would inflate the denominator of every open-rate calculation.
    const deliveredUserIds = new Set<string>();

    let push: Record<string, unknown> = { sent: 0, skipped: "disabled" };
    if (channels.push) {
      const permitted = recipients.filter((recipient) =>
        this.allowsPush(prefs.get(recipient.userId), dto.kind),
      );
      const mutedCount = recipients.length - permitted.length;

      // Global fatigue budget, enforced after the user's own switches and
      // before quiet-hours deferral. A deferred push is re-checked against the
      // budget when it is redelivered, which is what we want — its window will
      // have moved by then.
      const { allowed, suppressed: budgetSuppressed } =
        await this.filterByPushBudget(permitted, dto);

      // Callers that precompute `scheduledFor` (the alerts engine) already
      // cleared quiet hours, and a redelivery of an already-deferred item must
      // never defer again — either would loop.
      const alreadyDeferred = Boolean(dto.metadata?.quietHoursDeferred);

      const deliverNow: BroadcastRecipient[] = [];
      const deferred: Array<{ recipient: BroadcastRecipient; at: string }> = [];

      for (const recipient of allowed) {
        const pref = prefs.get(recipient.userId);
        const at = alreadyDeferred
          ? undefined
          : deferForQuietHours(pref?.quietHours ?? null, pref?.timezone);
        if (at) deferred.push({ recipient, at });
        else deliverNow.push(recipient);
      }

      if (deferred.length) await this.deferPush(deferred, dto);

      const sent = deliverNow.length
        ? await this.sendPush(
            deliverNow,
            dto,
            notificationIdByUser,
            deliveredUserIds,
          )
        : { sent: 0, skipped: "all recipients muted, over budget or deferred" };

      push = {
        ...sent,
        ...(mutedCount ? { muted: mutedCount } : {}),
        ...(budgetSuppressed ? { budgetSuppressed } : {}),
        ...(deferred.length ? { deferredForQuietHours: deferred.length } : {}),
      };
    }

    let email: Record<string, unknown> = { sent: 0, skipped: "disabled" };
    if (channels.email) {
      if (prefsLookupFailed) {
        // See the fail-closed note above: we cannot prove consent, so we do
        // not send. The notification still reaches the user in-app and by push.
        email = {
          sent: 0,
          skipped:
            "preference lookup failed; email suppressed to protect opt-outs",
        };
      } else {
        const allowed = recipients.filter(
          (recipient) =>
            prefs.get(recipient.userId)?.emailNotifications !== false,
        );
        email = allowed.length
          ? await this.sendEmail(allowed, dto)
          : { sent: 0, skipped: "all recipients opted out of email" };
      }
    }

    for (const ids of this.chunk(notificationIds, BROADCAST_BATCH_SIZE)) {
      await db
        .update(notifications)
        .set({
          channelStatus: {
            inApp: "delivered",
            push,
            email,
          },
        })
        .where(inArray(notifications.id, ids));
    }

    // Stamp delivery only for users a transport genuinely accepted. Best-effort:
    // telemetry must never fail a broadcast that already went out.
    const deliveredIds = Array.from(deliveredUserIds)
      .map((userId) => notificationIdByUser.get(userId))
      .filter((id): id is string => Boolean(id));
    if (deliveredIds.length) {
      const deliveredAt = new Date();
      for (const ids of this.chunk(deliveredIds, BROADCAST_BATCH_SIZE)) {
        try {
          await db
            .update(notifications)
            .set({ deliveredAt })
            .where(
              and(
                inArray(notifications.id, ids),
                isNull(notifications.deliveredAt),
              ),
            );
        } catch (error) {
          this.logger.warn(
            `Could not stamp delivered_at for ${ids.length} notification(s): ${this.errorMessage(error)}`,
          );
        }
      }
    }

    return {
      queued: false,
      recipientCount: recipients.length,
      insertedCount,
      push,
      email,
    };
  }

  /**
   * Re-queues a push for delivery at the end of each user's quiet-hours window.
   *
   * The requeued payload is push-only: the in-app row was already written by
   * this broadcast, and re-running the full delivery would duplicate it. The
   * `quietHoursDeferred` marker stops the redelivery from deferring a second
   * time if the drainer happens to run while the window is still closing.
   */
  private async deferPush(
    deferred: Array<{ recipient: BroadcastRecipient; at: string }>,
    dto: BroadcastNotificationDto,
  ) {
    for (const batch of this.chunk(deferred, BROADCAST_BATCH_SIZE)) {
      await db.insert(notificationQueue).values(
        batch.map(({ recipient, at }) => ({
          payload: {
            ...dto,
            audience: "specific",
            targetUserIds: [recipient.userId],
            channels: { inApp: false, push: true, email: false },
            scheduledFor: undefined,
            metadata: {
              ...(dto.metadata || {}),
              quietHoursDeferred: true,
            },
          } as unknown as Record<string, unknown>,
          scheduledFor: new Date(at),
          createdBy: recipient.userId,
        })),
      );
    }
  }

  private async resolveRecipients(
    dto: BroadcastNotificationDto,
  ): Promise<BroadcastRecipient[]> {
    if (dto.audience === "specific") {
      return Array.from(new Set(dto.targetUserIds || [])).map((id) => ({
        userId: toDatabaseUserId(id),
        email: null,
        fullName: null,
      }));
    }

    const fields = {
      userId: profiles.userId,
      email: profiles.email,
      fullName: profiles.fullName,
    };

    if (dto.audience === "approved_creators") {
      return db
        .select(fields)
        .from(profiles)
        .where(eq(profiles.creatorStatus, "approved"));
    }

    if (dto.audience === "creators") {
      return db
        .select(fields)
        .from(profiles)
        .where(
          and(
            isNotNull(profiles.creatorStatus),
            ne(profiles.creatorStatus, "none"),
          ),
        );
    }

    return db.select(fields).from(profiles);
  }

  private async sendExpoPush(
    recipients: Array<{ userId: string }>,
    dto: BroadcastNotificationDto,
    notificationIdByUser?: Map<string, string>,
    /** Collects users Expo actually accepted a message for (delivery telemetry). */
    deliveredUserIds?: Set<string>,
  ) {
    const userIds = Array.from(
      new Set(recipients.map((recipient) => recipient.userId)),
    );
    if (!userIds.length) return { sent: 0 };

    let sent = 0;
    let rejected = 0;
    const failures: string[] = [];
    // Tokens Expo tells us are dead (uninstalled app, or malformed). Pruned
    // after the send loop so a broadcast never leaves rot behind.
    const staleTokens: string[] = [];

    for (const userBatch of this.chunk(userIds, BROADCAST_BATCH_SIZE)) {
      const tokens = await db
        .select()
        .from(notificationPushTokens)
        .where(
          and(
            inArray(notificationPushTokens.userId, userBatch),
            eq(notificationPushTokens.provider, "expo"),
          ),
        );

      // Dedicated Android channels (created by the app on launch) let
      // opportunity/deadline alerts pop as heads-up notifications.
      const channelId =
        typeof dto.metadata?.androidChannelId === "string"
          ? dto.metadata.androidChannelId
          : "default";
      // Drives the interactive action buttons registered on the client via
      // setNotificationCategoryAsync; absent means a plain notification.
      const categoryId =
        typeof dto.metadata?.categoryId === "string"
          ? dto.metadata.categoryId
          : undefined;

      const messages: ExpoPushMessage[] = [];
      // Parallel to `messages`: which user each message belongs to, so a
      // per-ticket result can be attributed back for delivery telemetry.
      const messageUserIds: string[] = [];
      for (const item of tokens) {
        // A token that isn't even shaped like an Expo token can never work —
        // Expo would reject the whole chunk, so drop it here instead.
        if (!Expo.isExpoPushToken(item.token)) {
          staleTokens.push(item.token);
          rejected += 1;
          continue;
        }
        const notificationId = notificationIdByUser?.get(item.userId);
        messages.push({
          to: item.token,
          title: dto.title,
          body: dto.body,
          sound: "default",
          priority: "high",
          channelId,
          ...(categoryId ? { categoryId } : {}),
          data: {
            kind: dto.kind || "admin-broadcast",
            severity: dto.severity || "info",
            ...(dto.metadata || {}),
            // Lets the client attribute a tap back to the inbox row.
            ...(notificationId ? { notificationId } : {}),
          },
        });
        messageUserIds.push(item.userId);
      }

      // The SDK chunks to Expo's own per-request limit; don't second-guess it.
      // Ticket indices are chunk-LOCAL, so track how far through `messages`
      // (and therefore `messageUserIds`) each chunk starts — otherwise every
      // chunk after the first attributes its results to the wrong users.
      let messageOffset = 0;
      for (const chunk of this.expo.chunkPushNotifications(messages)) {
        const chunkStart = messageOffset;
        messageOffset += chunk.length;
        try {
          const tickets = await this.expo.sendPushNotificationsAsync(chunk);

          // Expo returns HTTP 200 with per-message tickets, so a rejected
          // message looks identical to a delivered one at the transport layer.
          // Counting messages instead of "ok" tickets is what made `sent`
          // meaningless before.
          tickets.forEach((ticket, index) => {
            if (ticket.status === "ok") {
              sent += 1;
              const userId = messageUserIds[chunkStart + index];
              if (userId) deliveredUserIds?.add(userId);
              return;
            }

            rejected += 1;
            const reason = ticket.details?.error;
            // The app was uninstalled (or the token rotated). This is the only
            // trustworthy signal for pruning, so act on it.
            if (reason === "DeviceNotRegistered") {
              const to = chunk[index]?.to;
              if (typeof to === "string") staleTokens.push(to);
            }
            failures.push(reason || ticket.message || "Expo rejected message");
          });
        } catch (error) {
          rejected += chunk.length;
          failures.push(
            error instanceof Error ? error.message : "Expo push failed",
          );
        }
      }
    }

    const pruned = await this.pruneExpoTokens(staleTokens);

    if (!sent && !rejected) {
      return { sent: 0, skipped: "no expo tokens" };
    }

    return {
      sent,
      ...(rejected ? { rejected } : {}),
      ...(pruned ? { pruned } : {}),
      // Distinct reasons only — a broadcast to 10k dead tokens shouldn't
      // return a 10k-entry string.
      ...(failures.length
        ? { failed: Array.from(new Set(failures)).join("; ") }
        : {}),
    };
  }

  // Deletes tokens Expo has told us are dead. Best-effort: a broadcast that
  // delivered fine shouldn't fail because cleanup did.
  private async pruneExpoTokens(tokens: string[]): Promise<number> {
    const unique = Array.from(new Set(tokens));
    if (!unique.length) return 0;

    let pruned = 0;
    for (const batch of this.chunk(unique, BROADCAST_BATCH_SIZE)) {
      try {
        await db
          .delete(notificationPushTokens)
          .where(
            and(
              eq(notificationPushTokens.provider, "expo"),
              inArray(notificationPushTokens.token, batch),
            ),
          );
        pruned += batch.length;
      } catch (error) {
        this.logger.warn(
          `Failed to prune ${batch.length} stale expo token(s): ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }

    if (pruned) {
      this.logger.log(`Pruned ${pruned} stale expo push token(s)`);
    }
    return pruned;
  }

  // Dispatches a notification across every push transport (Expo for mobile,
  // Web Push for browsers) and merges the per-transport results.
  private async sendPush(
    recipients: Array<{ userId: string }>,
    dto: BroadcastNotificationDto,
    notificationIdByUser?: Map<string, string>,
    deliveredUserIds?: Set<string>,
  ) {
    const [expo, web] = await Promise.all([
      this.sendExpoPush(
        recipients,
        dto,
        notificationIdByUser,
        deliveredUserIds,
      ),
      this.sendWebPush(recipients, dto, notificationIdByUser, deliveredUserIds),
    ]);
    return { sent: (expo.sent || 0) + (web.sent || 0), expo, web };
  }

  private async sendWebPush(
    recipients: Array<{ userId: string }>,
    dto: BroadcastNotificationDto,
    notificationIdByUser?: Map<string, string>,
    deliveredUserIds?: Set<string>,
  ) {
    const webpush = this.getWebpush();
    if (!webpush) return { sent: 0, skipped: "webpush not configured" };

    const userIds = Array.from(
      new Set(recipients.map((recipient) => recipient.userId)),
    );
    if (!userIds.length) return { sent: 0 };

    // Built per subscription rather than once: `notificationId` differs by user,
    // and the service worker needs it to attribute a click back to the row.
    const buildPayload = (notificationId?: string) =>
      JSON.stringify({
        title: dto.title,
        body: dto.body,
        kind: dto.kind || "admin-broadcast",
        severity: dto.severity || "info",
        data: {
          ...(dto.metadata || {}),
          ...(notificationId ? { notificationId } : {}),
        },
      });

    let sent = 0;
    const failures: string[] = [];
    const expiredIds: string[] = [];

    for (const userBatch of this.chunk(userIds, BROADCAST_BATCH_SIZE)) {
      const tokens = await db
        .select()
        .from(notificationPushTokens)
        .where(
          and(
            inArray(notificationPushTokens.userId, userBatch),
            eq(notificationPushTokens.provider, "webpush"),
          ),
        );

      for (const item of tokens) {
        const subscription = (item.device as any)?.subscription;
        if (!subscription?.endpoint) continue;

        try {
          await webpush.sendNotification(
            subscription,
            buildPayload(notificationIdByUser?.get(item.userId)),
          );
          sent += 1;
          deliveredUserIds?.add(item.userId);
        } catch (error: any) {
          // 404/410 mean the browser subscription is gone — prune it.
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            expiredIds.push(item.id);
          } else {
            failures.push(error?.message || "web push failed");
          }
        }
      }
    }

    if (expiredIds.length) {
      await db
        .delete(notificationPushTokens)
        .where(inArray(notificationPushTokens.id, expiredIds));
    }

    if (!sent && !failures.length) {
      return { sent: 0, skipped: "no webpush subscriptions" };
    }
    return failures.length ? { sent, failed: failures.join("; ") } : { sent };
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  /**
   * Email transport dispatcher. Prefers Brevo transactional email when
   * BREVO_API_KEY is configured; otherwise falls back to the legacy generic
   * webhook (NOTIFICATION_EMAIL_WEBHOOK_URL). Recipients arriving here have
   * already been filtered by the per-user `emailNotifications` preference in
   * deliverBroadcast — this method only handles transport.
   */
  private async sendEmail(
    recipients: Array<{ email: string | null; fullName: string | null }>,
    dto: BroadcastNotificationDto,
  ) {
    const emailRecipients = recipients.filter((recipient) => recipient.email);
    if (!emailRecipients.length) return { sent: 0, skipped: "no emails" };

    if (process.env.BREVO_API_KEY) {
      return this.sendBrevoEmail(emailRecipients, dto);
    }
    return this.sendEmailWebhook(emailRecipients, dto);
  }

  /**
   * Sends the broadcast as individual transactional emails via the Brevo REST
   * API. One API call covers up to BREVO_VERSION_LIMIT recipients using
   * `messageVersions`, which gives every recipient their own copy (no shared
   * "to" header leaking the audience). Failures are logged and reported in the
   * result — they never abort the broadcast.
   */
  private async sendBrevoEmail(
    recipients: Array<{ email: string | null; fullName: string | null }>,
    dto: BroadcastNotificationDto,
  ) {
    const apiKey = process.env.BREVO_API_KEY as string;
    const sender = {
      name: "Edutu",
      email: process.env.BREVO_SENDER_EMAIL || "no-reply@edutu.org",
    };

    // Dedupe by lowercased email so duplicate profile rows or repeated target
    // ids can't send the same person the same email twice.
    const seen = new Set<string>();
    const unique: Array<{ email: string; name?: string }> = [];
    for (const recipient of recipients) {
      const email = recipient.email?.trim();
      if (!email || !email.includes("@")) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const name = recipient.fullName?.trim();
      unique.push(name ? { email, name } : { email });
    }

    if (!unique.length) return { sent: 0, skipped: "no emails" };

    const subject = dto.title.trim();
    const htmlContent = this.buildBroadcastEmailHtml(dto);

    let sent = 0;
    const failures: string[] = [];

    for (const batch of this.chunk(unique, BREVO_VERSION_LIMIT)) {
      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender,
            subject,
            htmlContent,
            messageVersions: batch.map((to) => ({ to: [to] })),
          }),
        });

        if (!response.ok) {
          const detail = (await response.text().catch(() => "")).slice(0, 300);
          failures.push(`Brevo ${response.status}: ${detail}`);
          continue;
        }

        sent += batch.length;
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : "Brevo request failed",
        );
      }
    }

    if (failures.length) {
      this.logger.warn(
        `Brevo email broadcast issues (${sent}/${unique.length} sent): ${Array.from(new Set(failures)).join("; ")}`,
      );
    }

    return {
      sent,
      provider: "brevo",
      ...(failures.length
        ? { failed: Array.from(new Set(failures)).join("; ") }
        : {}),
    };
  }

  /** Minimal branded HTML wrapper around the plain-text broadcast body. */
  private buildBroadcastEmailHtml(dto: BroadcastNotificationDto): string {
    const title = this.escapeHtml(dto.title.trim());
    const body = this.escapeHtml(dto.body.trim()).replace(/\r?\n/g, "<br />");

    return [
      "<div style=\"margin:0;padding:24px 12px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">",
      '<div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">',
      '<div style="background-color:#101828;padding:20px 28px;">',
      '<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">edutu</span>',
      "</div>",
      '<div style="padding:28px;">',
      `<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#101828;">${title}</h1>`,
      `<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${body}</p>`,
      "</div>",
      '<div style="padding:16px 28px;border-top:1px solid #e5e7eb;">',
      '<p style="margin:0;font-size:12px;line-height:1.6;color:#98a2b3;">',
      "You received this email from Edutu. Manage your notification preferences in the Edutu app.",
      '<br />&copy; Edutu &middot; <a href="https://edutu.org" style="color:#98a2b3;">edutu.org</a>',
      "</p>",
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Legacy transport: forwards the recipient list to an external webhook.
  // Only used when BREVO_API_KEY is not configured.
  private async sendEmailWebhook(
    recipients: Array<{ email: string | null; fullName: string | null }>,
    dto: BroadcastNotificationDto,
  ) {
    const webhookUrl = process.env.NOTIFICATION_EMAIL_WEBHOOK_URL;
    const emailRecipients = recipients.filter((recipient) => recipient.email);

    if (!emailRecipients.length) return { sent: 0, skipped: "no emails" };
    if (!webhookUrl)
      return { sent: 0, skipped: "email webhook not configured" };

    try {
      await axios.post(
        webhookUrl,
        {
          recipients: emailRecipients,
          subject: dto.title,
          body: dto.body,
          metadata: dto.metadata || {},
        },
        { timeout: 10_000 },
      );
      return { sent: emailRecipients.length };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Email webhook failed";
      this.logger.warn(message);
      return { sent: 0, failed: message };
    }
  }
}
