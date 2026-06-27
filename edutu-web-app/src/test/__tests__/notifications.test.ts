import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchNotifications,
  getNotificationPreferences,
} from "../../services/notifications";

vi.mock("../../lib/apiBaseUrl", () => ({
  getApiBaseUrl: vi.fn(() => "https://api.edutu.test"),
}));

vi.mock("../../lib/localDevAuthHeaders", () => ({
  getLocalDevAuthHeaders: vi.fn(() => ({
    "X-Edutu-Admin-Email": "tester@edutu.org",
  })),
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe("notification service", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an auth token before loading notifications", async () => {
    await expect(fetchNotifications()).rejects.toThrow(
      "Sign in again to load notifications.",
    );
  });

  it("loads and maps notifications from the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: "notice-1",
          user_id: "user_123",
          kind: "opportunity-highlight",
          title: "New scholarship match",
          body: "A saved search has a fresh opportunity.",
          severity: "info",
          metadata: { source: "saved-search" },
          dedupe_key: "dedupe-1",
          channel_status: null,
          created_at: "2026-06-18T10:00:00.000Z",
          read_at: null,
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const notifications = await fetchNotifications(
      { limit: 10, cursor: "cursor-1" },
      "token-123",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.edutu.test/notifications?limit=10&cursor=cursor-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "X-Edutu-Admin-Email": "tester@edutu.org",
        }),
      }),
    );
    expect(notifications).toEqual([
      {
        id: "notice-1",
        kind: "opportunity-highlight",
        title: "New scholarship match",
        body: "A saved search has a fresh opportunity.",
        severity: "info",
        metadata: { source: "saved-search" },
        dedupeKey: "dedupe-1",
        createdAt: "2026-06-18T10:00:00.000Z",
        readAt: null,
      },
    ]);
  });

  it("returns default preferences when no user id is supplied", async () => {
    await expect(getNotificationPreferences("")).resolves.toMatchObject({
      pushNotifications: true,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: true,
      achievementCelebrations: true,
      weeklyDigest: false,
      marketingEmails: false,
      quietHours: { start: "22:00", end: "08:00" },
    });
  });

  it("normalizes notification preferences from the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        push_notifications: 0,
        emailNotifications: 1,
        opportunity_alerts: false,
        deadlineReminders: 1,
        goal_reminders: 0,
        achievementCelebrations: true,
        weekly_digest: 1,
        marketing_emails: false,
        quiet_hours: { start: "21:00", end: "07:00" },
        updated_at: "2026-06-18T10:00:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getNotificationPreferences("user_123", "token-123"),
    ).resolves.toEqual({
      pushNotifications: false,
      emailNotifications: true,
      opportunityAlerts: false,
      deadlineReminders: true,
      goalReminders: false,
      achievementCelebrations: true,
      weeklyDigest: true,
      marketingEmails: false,
      quietHours: { start: "21:00", end: "07:00" },
      updatedAt: "2026-06-18T10:00:00.000Z",
    });
  });
});
