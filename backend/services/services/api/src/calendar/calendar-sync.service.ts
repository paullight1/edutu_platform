import { Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import axios from "axios";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  calendarConnections,
  calendarEventLinks,
  calendarFeedTokens,
  goals,
} from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
import type { BroadcastNotificationDto } from "../notifications/dto/notification.dto";

export type CalendarProvider = "google" | "outlook" | "apple_caldav";
const OAUTH_PROVIDERS: CalendarProvider[] = ["google", "outlook"];
const REMINDER_OFFSETS_DAYS = [7, 3, 1, 0];

type GoalLike = {
  id: string;
  title: string;
  description?: string | null;
  targetDate?: Date | string | null;
  deadline?: Date | string | null;
};

interface EventFields {
  goalId: string;
  title: string;
  description: string;
  dateOnly: string;
}

interface InboundChange {
  externalEventId: string;
  cancelled?: boolean;
  dateOnly?: string;
}

function toDateOnly(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildEventFields(goal: GoalLike): EventFields | null {
  const rawDate = goal.targetDate ?? goal.deadline ?? null;
  if (!rawDate || !goal.id || !goal.title) return null;
  return {
    goalId: goal.id,
    title: goal.title,
    description: goal.description || "",
    dateOnly: toDateOnly(rawDate),
  };
}

function icsEscape(text: string): string {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Builds a single VEVENT (all-day, 1-day-before alarm) for CalDAV/webcal. */
export function buildVevent(event: EventFields, stamp: string): string {
  return [
    "BEGIN:VEVENT",
    `UID:edutu-${event.goalId}@edutu`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${event.dateOnly.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${addDaysIso(event.dateOnly, 1).replace(/-/g, "")}`,
    `SUMMARY:${icsEscape(event.title)}`,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : "",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(event.title)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n");
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  // --- provider config ---
  isProviderConfigured(provider: CalendarProvider): boolean {
    if (provider === "google") {
      return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI,
      );
    }
    if (provider === "outlook") {
      return Boolean(
        process.env.MS_CLIENT_ID &&
        process.env.MS_CLIENT_SECRET &&
        process.env.MS_REDIRECT_URI,
      );
    }
    return true; // caldav is always available (user-supplied credentials)
  }

  // --- OAuth: authorize URLs ---
  getAuthUrl(userId: string, provider: CalendarProvider): string | null {
    if (!this.isProviderConfigured(provider)) return null;
    if (provider === "google") {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: "https://www.googleapis.com/auth/calendar.events",
        state: `google:${userId}`,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    if (provider === "outlook") {
      const params = new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!,
        redirect_uri: process.env.MS_REDIRECT_URI!,
        response_type: "code",
        response_mode: "query",
        scope: "offline_access Calendars.ReadWrite",
        state: `outlook:${userId}`,
      });
      return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    }
    return null;
  }

  // --- OAuth: token exchange on callback ---
  async handleOAuthCallback(
    provider: CalendarProvider,
    code: string,
    userId: string,
  ): Promise<boolean> {
    if (!OAUTH_PROVIDERS.includes(provider)) return false;
    if (!this.isProviderConfigured(provider)) return false;

    const tokenUrl =
      provider === "google"
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id:
        provider === "google"
          ? process.env.GOOGLE_CLIENT_ID!
          : process.env.MS_CLIENT_ID!,
      client_secret:
        provider === "google"
          ? process.env.GOOGLE_CLIENT_SECRET!
          : process.env.MS_CLIENT_SECRET!,
      redirect_uri:
        provider === "google"
          ? process.env.GOOGLE_REDIRECT_URI!
          : process.env.MS_REDIRECT_URI!,
      ...(provider === "outlook"
        ? { scope: "offline_access Calendars.ReadWrite" }
        : {}),
    });

    try {
      const { data } = await axios.post(tokenUrl, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10_000,
      });
      if (!data?.access_token) return false;

      const dbUserId = toDatabaseUserId(userId);
      const expiryDate = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null;

      await db
        .insert(calendarConnections)
        .values({
          userId: dbUserId,
          provider,
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          expiryDate,
          calendarId: provider === "google" ? "primary" : "",
          status: "active",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [calendarConnections.userId, calendarConnections.provider],
          set: {
            accessToken: data.access_token,
            ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
            expiryDate,
            status: "active",
            updatedAt: new Date(),
          },
        });
      return true;
    } catch (error) {
      this.logger.warn(
        `${provider} OAuth callback failed`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  // --- Apple CalDAV connect (app-specific password) ---
  async connectCaldav(
    userId: string,
    username: string,
    appPassword: string,
    calendarUrl?: string,
  ): Promise<boolean> {
    const url =
      calendarUrl ||
      process.env.CALDAV_DEFAULT_CALENDAR_URL ||
      "https://caldav.icloud.com";
    const dbUserId = toDatabaseUserId(userId);

    await db
      .insert(calendarConnections)
      .values({
        userId: dbUserId,
        provider: "apple_caldav",
        caldavUrl: url,
        caldavUsername: username,
        caldavPassword: appPassword,
        calendarId: url,
        status: "active",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [calendarConnections.userId, calendarConnections.provider],
        set: {
          caldavUrl: url,
          caldavUsername: username,
          caldavPassword: appPassword,
          calendarId: url,
          status: "active",
          updatedAt: new Date(),
        },
      });
    return true;
  }

  async getStatus(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const rows = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, dbUserId));

    const connected = rows
      .filter((row) => row.status === "active")
      .map((row) => row.provider);

    return {
      google: connected.includes("google"),
      outlook: connected.includes("outlook"),
      apple_caldav: connected.includes("apple_caldav"),
      configured: {
        google: this.isProviderConfigured("google"),
        outlook: this.isProviderConfigured("outlook"),
      },
      feedUrl: await this.getFeedUrl(dbUserId),
    };
  }

  async disconnect(userId: string, provider: CalendarProvider) {
    const dbUserId = toDatabaseUserId(userId);
    await db
      .delete(calendarConnections)
      .where(
        and(
          eq(calendarConnections.userId, dbUserId),
          eq(calendarConnections.provider, provider),
        ),
      );
    await db
      .delete(calendarEventLinks)
      .where(
        and(
          eq(calendarEventLinks.userId, dbUserId),
          eq(calendarEventLinks.provider, provider),
        ),
      );
    return { success: true };
  }

  // --- Webcal subscription feed (Apple default; also Google/Outlook) ---
  private async getFeedUrl(dbUserId: string): Promise<string | null> {
    const base = process.env.API_PUBLIC_URL || process.env.APP_URL;
    if (!base) return null;
    const [existing] = await db
      .select()
      .from(calendarFeedTokens)
      .where(eq(calendarFeedTokens.userId, dbUserId));
    if (!existing) return null;
    return `${base.replace(/\/$/, "")}/calendar/feed/${existing.token}.ics`;
  }

  async ensureFeedUrl(userId: string): Promise<{ url: string | null }> {
    const dbUserId = toDatabaseUserId(userId);
    const [existing] = await db
      .select()
      .from(calendarFeedTokens)
      .where(eq(calendarFeedTokens.userId, dbUserId));
    if (!existing) {
      const token = `${dbUserId.replace(/-/g, "")}${Math.abs(
        hashString(`${dbUserId}:feed`),
      ).toString(36)}`;
      await db
        .insert(calendarFeedTokens)
        .values({ userId: dbUserId, token })
        .onConflictDoNothing();
    }
    return { url: await this.getFeedUrl(dbUserId) };
  }

  async getFeedIcs(token: string, now: Date): Promise<string | null> {
    const [feed] = await db
      .select()
      .from(calendarFeedTokens)
      .where(eq(calendarFeedTokens.token, token));
    if (!feed) return null;

    const rows = await db
      .select()
      .from(goals)
      .where(eq(goals.userId, feed.userId));

    const stamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const vevents = rows
      .map((goal) =>
        buildEventFields({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          targetDate: goal.targetDate,
          deadline: goal.deadline,
        }),
      )
      .filter((event): event is EventFields => event !== null)
      .map((event) => buildVevent(event, stamp));

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Edutu//Goals Calendar//EN",
      "CALSCALE:GREGORIAN",
      "X-WR-CALNAME:Edutu Goals",
      ...vevents,
      "END:VCALENDAR",
    ].join("\r\n");
  }

  // --- Outbound: goal → each connected provider ---
  async syncGoal(userId: string, goal: GoalLike): Promise<void> {
    const fields = buildEventFields(goal);
    if (!fields) return;
    const dbUserId = toDatabaseUserId(userId);

    const connections = await db
      .select()
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.userId, dbUserId),
          eq(calendarConnections.status, "active"),
        ),
      );

    for (const conn of connections) {
      await this.upsertEvent(conn, fields).catch((error) =>
        this.logger.warn(
          `${conn.provider} sync failed for goal ${goal.id}`,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async removeGoal(userId: string, goalId: string): Promise<void> {
    const dbUserId = toDatabaseUserId(userId);
    const links = await db
      .select()
      .from(calendarEventLinks)
      .where(
        and(
          eq(calendarEventLinks.userId, dbUserId),
          eq(calendarEventLinks.goalId, goalId),
        ),
      );

    for (const link of links) {
      const [conn] = await db
        .select()
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, dbUserId),
            eq(calendarConnections.provider, link.provider),
          ),
        );
      if (conn) {
        await this.deleteEvent(conn, link.externalEventId).catch(() => {});
      }
      await db
        .delete(calendarEventLinks)
        .where(eq(calendarEventLinks.id, link.id));
    }
  }

  private async upsertEvent(conn: any, fields: EventFields): Promise<void> {
    const [existing] = await db
      .select()
      .from(calendarEventLinks)
      .where(
        and(
          eq(calendarEventLinks.goalId, fields.goalId),
          eq(calendarEventLinks.provider, conn.provider),
        ),
      );

    const externalId = existing
      ? await this.providerUpdateEvent(conn, existing.externalEventId, fields)
      : await this.providerCreateEvent(conn, fields);

    if (!existing && externalId) {
      await db.insert(calendarEventLinks).values({
        userId: conn.userId,
        provider: conn.provider,
        goalId: fields.goalId,
        externalEventId: externalId,
      });
    }
  }

  // --- provider dispatch: create/update/delete ---
  private async providerCreateEvent(
    conn: any,
    fields: EventFields,
  ): Promise<string | null> {
    if (conn.provider === "google") {
      const token = await this.oauthAccessToken(conn);
      if (!token) return null;
      const res = await axios.post(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendarId || "primary")}/events`,
        this.googleEventBody(fields),
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
      );
      return res.data?.id ?? null;
    }
    if (conn.provider === "outlook") {
      const token = await this.oauthAccessToken(conn);
      if (!token) return null;
      const res = await axios.post(
        "https://graph.microsoft.com/v1.0/me/events",
        this.outlookEventBody(fields),
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
      );
      return res.data?.id ?? null;
    }
    // apple_caldav — PUT an iCalendar object; the href is our external id.
    return this.caldavPut(conn, fields);
  }

  private async providerUpdateEvent(
    conn: any,
    externalId: string,
    fields: EventFields,
  ): Promise<string | null> {
    if (conn.provider === "google") {
      const token = await this.oauthAccessToken(conn);
      if (token) {
        await axios.patch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendarId || "primary")}/events/${externalId}`,
          this.googleEventBody(fields),
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
        );
      }
      return externalId;
    }
    if (conn.provider === "outlook") {
      const token = await this.oauthAccessToken(conn);
      if (token) {
        await axios.patch(
          `https://graph.microsoft.com/v1.0/me/events/${externalId}`,
          this.outlookEventBody(fields),
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
        );
      }
      return externalId;
    }
    await this.caldavPut(conn, fields);
    return externalId;
  }

  private async deleteEvent(conn: any, externalId: string): Promise<void> {
    if (conn.provider === "google") {
      const token = await this.oauthAccessToken(conn);
      if (token) {
        await axios.delete(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendarId || "primary")}/events/${externalId}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
        );
      }
      return;
    }
    if (conn.provider === "outlook") {
      const token = await this.oauthAccessToken(conn);
      if (token) {
        await axios.delete(
          `https://graph.microsoft.com/v1.0/me/events/${externalId}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
        );
      }
      return;
    }
    await this.caldavDelete(conn, externalId);
  }

  private googleEventBody(fields: EventFields) {
    return {
      summary: fields.title,
      description: fields.description || undefined,
      start: { date: fields.dateOnly },
      end: { date: addDaysIso(fields.dateOnly, 1) },
      extendedProperties: { private: { edutuGoalId: fields.goalId } },
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 24 * 60 }],
      },
    };
  }

  private outlookEventBody(fields: EventFields) {
    return {
      subject: fields.title,
      body: { contentType: "text", content: fields.description || "" },
      isAllDay: true,
      start: { dateTime: `${fields.dateOnly}T00:00:00`, timeZone: "UTC" },
      end: {
        dateTime: `${addDaysIso(fields.dateOnly, 1)}T00:00:00`,
        timeZone: "UTC",
      },
      isReminderOn: true,
      reminderMinutesBeforeStart: 24 * 60,
    };
  }

  // --- CalDAV (apple) event write/delete ---
  private caldavHref(conn: any, goalId: string): string {
    const base = String(conn.calendarId || conn.caldavUrl || "").replace(
      /\/$/,
      "",
    );
    return `${base}/edutu-${goalId}.ics`;
  }

  private async caldavPut(
    conn: any,
    fields: EventFields,
  ): Promise<string | null> {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Edutu//Goals//EN",
      buildVevent(fields, stamp),
      "END:VCALENDAR",
    ].join("\r\n");
    const href = this.caldavHref(conn, fields.goalId);
    await axios.put(href, ics, {
      auth: { username: conn.caldavUsername, password: conn.caldavPassword },
      headers: { "Content-Type": "text/calendar; charset=utf-8" },
      timeout: 10_000,
    });
    return href;
  }

  private async caldavDelete(conn: any, externalId: string): Promise<void> {
    await axios
      .delete(externalId, {
        auth: { username: conn.caldavUsername, password: conn.caldavPassword },
        timeout: 10_000,
      })
      .catch(() => {});
  }

  // --- OAuth access token (refresh if expired) ---
  private async oauthAccessToken(conn: any): Promise<string | null> {
    const skewMs = 60_000;
    if (
      conn.accessToken &&
      conn.expiryDate &&
      new Date(conn.expiryDate).getTime() - skewMs > Date.now()
    ) {
      return conn.accessToken;
    }
    if (!conn.refreshToken) return conn.accessToken ?? null;

    const tokenUrl =
      conn.provider === "google"
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
      client_id:
        conn.provider === "google"
          ? process.env.GOOGLE_CLIENT_ID || ""
          : process.env.MS_CLIENT_ID || "",
      client_secret:
        conn.provider === "google"
          ? process.env.GOOGLE_CLIENT_SECRET || ""
          : process.env.MS_CLIENT_SECRET || "",
      ...(conn.provider === "outlook"
        ? { scope: "offline_access Calendars.ReadWrite" }
        : {}),
    });

    try {
      const { data } = await axios.post(tokenUrl, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10_000,
      });
      if (!data?.access_token) return null;
      const expiryDate = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null;
      await db
        .update(calendarConnections)
        .set({
          accessToken: data.access_token,
          ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
          expiryDate,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(calendarConnections.userId, conn.userId),
            eq(calendarConnections.provider, conn.provider),
          ),
        );
      return data.access_token;
    } catch (error) {
      this.logger.warn(
        `${conn.provider} token refresh failed`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  // --- Inbound: incremental pull per connection ---
  @Cron(CronExpression.EVERY_10_MINUTES)
  async pullAllConnections(): Promise<void> {
    if (process.env.CALENDAR_SYNC_ENABLED === "false") return;
    const connections = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.status, "active"));
    for (const conn of connections) {
      await this.pull(conn).catch((error) =>
        this.logger.warn(
          `Inbound ${conn.provider} sync failed`,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async syncNow(userId: string): Promise<{ synced: number }> {
    const dbUserId = toDatabaseUserId(userId);
    const connections = await db
      .select()
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.userId, dbUserId),
          eq(calendarConnections.status, "active"),
        ),
      );
    let synced = 0;
    for (const conn of connections) {
      await this.pull(conn).catch(() => {});
      synced += 1;
    }
    return { synced };
  }

  private async pull(conn: any): Promise<void> {
    let changes: InboundChange[] = [];
    let nextSyncState: string | null | undefined;

    if (conn.provider === "google") {
      const result = await this.googlePull(conn);
      changes = result.changes;
      nextSyncState = result.nextSyncState;
    } else if (conn.provider === "outlook") {
      const result = await this.outlookPull(conn);
      changes = result.changes;
      nextSyncState = result.nextSyncState;
    } else {
      return; // CalDAV inbound sync not yet implemented (webcal covers Edutu→Apple)
    }

    for (const change of changes) {
      const [link] = await db
        .select()
        .from(calendarEventLinks)
        .where(
          and(
            eq(calendarEventLinks.externalEventId, change.externalEventId),
            eq(calendarEventLinks.provider, conn.provider),
          ),
        );
      if (!link) continue;
      await this.applyInboundChange(conn.userId, link, change);
    }

    if (nextSyncState) {
      await db
        .update(calendarConnections)
        .set({ syncState: nextSyncState, updatedAt: new Date() })
        .where(
          and(
            eq(calendarConnections.userId, conn.userId),
            eq(calendarConnections.provider, conn.provider),
          ),
        );
    }
  }

  private async googlePull(conn: any) {
    const token = await this.oauthAccessToken(conn);
    if (!token) return { changes: [] as InboundChange[] };
    const params: Record<string, string> = {
      showDeleted: "true",
      singleEvents: "true",
      maxResults: "250",
    };
    if (conn.syncState) params.syncToken = conn.syncState;
    else
      params.timeMin = new Date(conn.connectedAt || Date.now()).toISOString();

    try {
      const res = await axios.get(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendarId || "primary")}/events`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params,
          timeout: 10_000,
        },
      );
      const changes: InboundChange[] = (res.data?.items ?? []).map(
        (event: any) => ({
          externalEventId: event.id,
          cancelled: event.status === "cancelled",
          dateOnly: event.start?.date || event.start?.dateTime?.slice(0, 10),
        }),
      );
      return { changes, nextSyncState: res.data?.nextSyncToken };
    } catch (error: any) {
      if (error?.response?.status === 410) {
        await db
          .update(calendarConnections)
          .set({ syncState: null, updatedAt: new Date() })
          .where(
            and(
              eq(calendarConnections.userId, conn.userId),
              eq(calendarConnections.provider, "google"),
            ),
          );
      }
      throw error;
    }
  }

  private async outlookPull(conn: any) {
    const token = await this.oauthAccessToken(conn);
    if (!token) return { changes: [] as InboundChange[] };
    const url =
      conn.syncState ||
      "https://graph.microsoft.com/v1.0/me/events/delta?$select=id,start,isCancelled";

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    });
    const changes: InboundChange[] = (res.data?.value ?? []).map(
      (event: any) => ({
        externalEventId: event.id,
        cancelled: Boolean(event["@removed"]) || event.isCancelled === true,
        dateOnly: event.start?.dateTime?.slice(0, 10),
      }),
    );
    return {
      changes,
      nextSyncState: res.data?.["@odata.deltaLink"] || conn.syncState,
    };
  }

  private async applyInboundChange(
    dbUserId: string,
    link: any,
    change: InboundChange,
  ): Promise<void> {
    if (change.cancelled) {
      await db
        .delete(calendarEventLinks)
        .where(eq(calendarEventLinks.id, link.id));
      return;
    }
    if (!change.dateOnly) return;
    const targetDate = new Date(`${change.dateOnly}T00:00:00.000Z`);
    if (Number.isNaN(targetDate.getTime())) return;

    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, link.goalId), eq(goals.userId, dbUserId)));
    if (!goal) return;

    const currentDate = goal.targetDate ? new Date(goal.targetDate) : null;
    if (currentDate && toDateOnly(currentDate) === toDateOnly(targetDate))
      return;

    await db
      .update(goals)
      .set({
        targetDate,
        deadline: change.dateOnly,
        updatedAt: new Date(),
      })
      .where(eq(goals.id, link.goalId));

    await this.rescheduleReminders(
      dbUserId,
      link.goalId,
      goal.title,
      targetDate,
    );
  }

  private async rescheduleReminders(
    dbUserId: string,
    goalId: string,
    title: string,
    targetDate: Date,
  ): Promise<void> {
    if (!this.notificationsService) return;
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
          metadata: {
            goalId,
            targetDate: targetDate.toISOString(),
            daysBefore,
          },
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

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}
