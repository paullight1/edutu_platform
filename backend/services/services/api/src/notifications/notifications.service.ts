import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import axios from "axios";
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
const PUSH_BATCH_SIZE = 100;

type BroadcastRecipient = {
  userId: string;
  email: string | null;
  fullName: string | null;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

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

    return this.deliverBroadcast(dto);
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

  private async deliverBroadcast(dto: BroadcastNotificationDto) {
    const channels = { ...DEFAULT_CHANNELS, ...(dto.channels || {}) };
    const recipients = await this.resolveRecipients(dto);

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
          .returning({ id: notifications.id });

        insertedCount += rows.length;
        notificationIds.push(...rows.map((row) => row.id));
      }
    }

    const push = channels.push
      ? await this.sendExpoPush(recipients, dto)
      : { sent: 0, skipped: "disabled" };
    const email = channels.email
      ? await this.sendEmailWebhook(recipients, dto)
      : { sent: 0, skipped: "disabled" };

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

    return {
      queued: false,
      recipientCount: recipients.length,
      insertedCount,
      push,
      email,
    };
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
  ) {
    const userIds = Array.from(
      new Set(recipients.map((recipient) => recipient.userId)),
    );
    if (!userIds.length) return { sent: 0 };

    let sent = 0;
    const failures: string[] = [];

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

      for (const tokenBatch of this.chunk(tokens, PUSH_BATCH_SIZE)) {
        const messages = tokenBatch.map((item) => ({
          to: item.token,
          title: dto.title,
          body: dto.body,
          sound: "default",
          priority: "high",
          data: {
            kind: dto.kind || "admin-broadcast",
            severity: dto.severity || "info",
            ...(dto.metadata || {}),
          },
        }));

        try {
          await axios.post("https://exp.host/--/api/v2/push/send", messages, {
            headers: { "Content-Type": "application/json" },
            timeout: 10_000,
          });

          sent += messages.length;
        } catch (error) {
          failures.push(
            error instanceof Error ? error.message : "Expo push failed",
          );
        }
      }
    }

    if (!sent && !failures.length) {
      return { sent: 0, skipped: "no expo tokens" };
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
