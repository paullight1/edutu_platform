import { Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import axios from "axios";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  calendarEventLinks,
  goals,
  googleCalendarConnections,
} from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
import type { BroadcastNotificationDto } from "../notifications/dto/notification.dto";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const REMINDER_OFFSETS_DAYS = [7, 3, 1, 0];

type GoalLike = {
  id: string;
  title: string;
  description?: string | null;
  targetDate?: Date | string | null;
  deadline?: Date | string | null;
};

function toDateOnly(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Pure mapping from an Edutu goal to a Google Calendar all-day event body.
 * `extendedProperties.private.edutuGoalId` lets the inbound sync recognise
 * Edutu-authored events and map changes back to the right goal.
 */
export function buildGoalEventBody(goal: GoalLike): Record<string, unknown> | null {
  const rawDate = goal.targetDate ?? goal.deadline ?? null;
  if (!rawDate) return null;
  const start = toDateOnly(rawDate);

  return {
    summary: goal.title,
    description: goal.description || undefined,
    start: { date: start },
    end: { date: addDaysIso(start, 1) }, // all-day end date is exclusive
    extendedProperties: { private: { edutuGoalId: goal.id } },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 24 * 60 }],
    },
  };
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private oauthLib: any = null;
  private oauthChecked = false;

  constructor(
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI,
    );
  }

  private createOAuthClient(): any | null {
    if (!this.isConfigured()) return null;
    if (!this.oauthChecked) {
      this.oauthChecked = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        this.oauthLib = require("google-auth-library");
      } catch {
        this.logger.warn(
          "Google Calendar disabled: google-auth-library not installed",
        );
        this.oauthLib = null;
      }
    }
    if (!this.oauthLib) return null;
    return new this.oauthLib.OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  // --- OAuth ---
  getAuthUrl(userId: string): string | null {
    const client = this.createOAuthClient();
    if (!client) return null;
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      state: userId,
    });
  }

  async handleCallback(code: string, userId: string): Promise<boolean> {
    const client = this.createOAuthClient();
    if (!client) return false;

    const { tokens } = await client.getToken(code);
    if (!tokens?.refresh_token && !tokens?.access_token) return false;

    const dbUserId = toDatabaseUserId(userId);
    await db
      .insert(googleCalendarConnections)
      .values({
        userId: dbUserId,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? "",
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        status: "active",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: googleCalendarConnections.userId,
        set: {
          accessToken: tokens.access_token ?? null,
          // keep an existing refresh token if Google omits it on re-consent
          ...(tokens.refresh_token
            ? { refreshToken: tokens.refresh_token }
            : {}),
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          status: "active",
          updatedAt: new Date(),
        },
      });
    return true;
  }

  async getStatus(userId: string): Promise<{ connected: boolean }> {
    if (!this.isConfigured()) return { connected: false };
    const [conn] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, toDatabaseUserId(userId)));
    return { connected: Boolean(conn && conn.status === "active") };
  }

  async disconnect(userId: string): Promise<{ success: boolean }> {
    const dbUserId = toDatabaseUserId(userId);
    await db
      .delete(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, dbUserId));
    await db
      .delete(calendarEventLinks)
      .where(eq(calendarEventLinks.userId, dbUserId));
    return { success: true };
  }

  private async getAccessToken(conn: any): Promise<string | null> {
    const skewMs = 60_000;
    if (
      conn.accessToken &&
      conn.expiryDate &&
      new Date(conn.expiryDate).getTime() - skewMs > Date.now()
    ) {
      return conn.accessToken;
    }

    const client = this.createOAuthClient();
    if (!client || !conn.refreshToken) return null;

    try {
      client.setCredentials({ refresh_token: conn.refreshToken });
      const { token } = await client.getAccessToken();
      const expiry = client.credentials?.expiry_date;
      if (token) {
        await db
          .update(googleCalendarConnections)
          .set({
            accessToken: token,
            expiryDate: expiry ? new Date(expiry) : null,
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarConnections.userId, conn.userId));
      }
      return token ?? null;
    } catch (error) {
      this.logger.warn(
        `Google token refresh failed for ${conn.userId}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  private async loadConnection(userId: string): Promise<any | null> {
    if (!this.isConfigured()) return null;
    const [conn] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, toDatabaseUserId(userId)));
    return conn && conn.status === "active" ? conn : null;
  }

  // --- Outbound: goal → Google event ---
  async syncGoal(userId: string, goal: GoalLike): Promise<void> {
    const body = buildGoalEventBody(goal);
    if (!body) return;
    const conn = await this.loadConnection(userId);
    if (!conn) return;

    const accessToken = await this.getAccessToken(conn);
    if (!accessToken) return;

    const dbUserId = toDatabaseUserId(userId);
    const [existing] = await db
      .select()
      .from(calendarEventLinks)
      .where(eq(calendarEventLinks.goalId, goal.id));

    try {
      if (existing) {
        await axios.patch(
          `${CALENDAR_API}/calendars/${encodeURIComponent(conn.calendarId)}/events/${existing.googleEventId}`,
          body,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 },
        );
      } else {
        const res = await axios.post(
          `${CALENDAR_API}/calendars/${encodeURIComponent(conn.calendarId)}/events`,
          body,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 },
        );
        const eventId = res.data?.id;
        if (eventId) {
          await db.insert(calendarEventLinks).values({
            userId: dbUserId,
            goalId: goal.id,
            googleEventId: eventId,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Google Calendar sync failed for goal ${goal.id}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async removeGoal(userId: string, goalId: string): Promise<void> {
    const conn = await this.loadConnection(userId);
    if (!conn) return;
    const [link] = await db
      .select()
      .from(calendarEventLinks)
      .where(eq(calendarEventLinks.goalId, goalId));
    if (!link) return;

    const accessToken = await this.getAccessToken(conn);
    if (accessToken) {
      try {
        await axios.delete(
          `${CALENDAR_API}/calendars/${encodeURIComponent(conn.calendarId)}/events/${link.googleEventId}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 },
        );
      } catch (error) {
        this.logger.warn(
          `Google Calendar delete failed for goal ${goalId}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    await db
      .delete(calendarEventLinks)
      .where(eq(calendarEventLinks.id, link.id));
  }

  // --- Inbound: Google → goal (incremental via syncToken) ---
  @Cron(CronExpression.EVERY_10_MINUTES)
  async pullAllConnections(): Promise<void> {
    if (
      process.env.GOOGLE_CALENDAR_SYNC_ENABLED === "false" ||
      !this.isConfigured()
    ) {
      return;
    }
    const connections = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.status, "active"));
    for (const conn of connections) {
      await this.pullChanges(conn).catch((error) =>
        this.logger.warn(
          `Inbound sync failed for ${conn.userId}`,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async syncNow(userId: string): Promise<{ synced: boolean }> {
    const conn = await this.loadConnection(userId);
    if (!conn) return { synced: false };
    await this.pullChanges(conn);
    return { synced: true };
  }

  private async pullChanges(conn: any): Promise<void> {
    const accessToken = await this.getAccessToken(conn);
    if (!accessToken) return;

    const params: Record<string, string> = {
      showDeleted: "true",
      singleEvents: "true",
      maxResults: "250",
    };
    if (conn.syncToken) params.syncToken = conn.syncToken;
    else params.timeMin = new Date(conn.connectedAt || Date.now()).toISOString();

    let res;
    try {
      res = await axios.get(
        `${CALENDAR_API}/calendars/${encodeURIComponent(conn.calendarId)}/events`,
        { headers: { Authorization: `Bearer ${accessToken}` }, params, timeout: 10_000 },
      );
    } catch (error: any) {
      // 410 GONE → sync token expired; clear it so the next run does a full sync.
      if (error?.response?.status === 410) {
        await db
          .update(googleCalendarConnections)
          .set({ syncToken: null, updatedAt: new Date() })
          .where(eq(googleCalendarConnections.userId, conn.userId));
      }
      throw error;
    }

    for (const event of res.data?.items ?? []) {
      const goalId = event?.extendedProperties?.private?.edutuGoalId;
      if (!goalId) continue;
      await this.applyInboundEvent(conn.userId, goalId, event);
    }

    if (res.data?.nextSyncToken) {
      await db
        .update(googleCalendarConnections)
        .set({ syncToken: res.data.nextSyncToken, updatedAt: new Date() })
        .where(eq(googleCalendarConnections.userId, conn.userId));
    }
  }

  private async applyInboundEvent(
    dbUserId: string,
    goalId: string,
    event: any,
  ): Promise<void> {
    // Cancelled in Google → stop tracking (leave the Edutu goal intact).
    if (event.status === "cancelled") {
      await db
        .delete(calendarEventLinks)
        .where(
          and(
            eq(calendarEventLinks.goalId, goalId),
            eq(calendarEventLinks.userId, dbUserId),
          ),
        );
      return;
    }

    const newDate = event.start?.date || event.start?.dateTime;
    if (!newDate) return;
    const targetDate = new Date(newDate);
    if (Number.isNaN(targetDate.getTime())) return;

    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, dbUserId)));
    if (!goal) return;

    const currentDate = goal.targetDate ? new Date(goal.targetDate) : null;
    if (currentDate && toDateOnly(currentDate) === toDateOnly(targetDate)) return;

    // Direct DB write (not GoalsService) so we don't re-trigger outbound sync.
    await db
      .update(goals)
      .set({
        targetDate,
        deadline: targetDate.toISOString().slice(0, 10),
        updatedAt: new Date(),
      })
      .where(eq(goals.id, goalId));

    await this.rescheduleReminders(dbUserId, goalId, goal.title, targetDate);
  }

  private async rescheduleReminders(
    dbUserId: string,
    goalId: string,
    title: string,
    targetDate: Date,
  ): Promise<void> {
    if (!this.notificationsService) return;
    // Mirror GoalsService.buildGoalReminders; replaceScheduledUserNotifications
    // injects userId/dedupePrefix/channels itself.
    const reminders: BroadcastNotificationDto[] = REMINDER_OFFSETS_DAYS.map(
      (daysBefore) => {
        const scheduledFor = new Date(targetDate);
        scheduledFor.setUTCDate(scheduledFor.getUTCDate() - daysBefore);
        scheduledFor.setUTCHours(9, 0, 0, 0);
        return {
          title:
            daysBefore === 0
              ? "Goal deadline today"
              : `${daysBefore} day${daysBefore === 1 ? "" : "s"} until goal deadline`,
          body: title,
          kind: "goal-reminder",
          severity: daysBefore <= 1 ? "warning" : "info",
          scheduledFor: scheduledFor.toISOString(),
          dedupeKey: `goal:${goalId}:${daysBefore}`,
          metadata: { goalId, targetDate: targetDate.toISOString(), daysBefore },
        } as BroadcastNotificationDto;
      },
    );

    try {
      await this.notificationsService.replaceScheduledUserNotifications(
        dbUserId,
        `goal:${goalId}`,
        reminders,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to reschedule reminders for goal ${goalId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
