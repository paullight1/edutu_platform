import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationInbox from "../../components/NotificationInbox";

const notificationContext = vi.hoisted(() => ({
  value: {
    notifications: [
      {
        id: "notice-1",
        kind: "opportunity-highlight" as const,
        title: "New scholarship match",
        body: "A saved search has a fresh opportunity.",
        severity: "info" as const,
        createdAt: "2026-06-18T10:00:00.000Z",
        readAt: null,
      },
    ],
    unreadCount: 1,
    loading: false,
    error: null,
    hasMore: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    fetchMore: vi.fn().mockResolvedValue(undefined),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    preferences: {
      pushNotifications: true,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: false,
      achievementCelebrations: true,
      weeklyDigest: false,
      marketingEmails: false,
      quietHours: { start: "22:00", end: "08:00" },
      updatedAt: "2026-06-18T10:00:00.000Z",
    },
    savePreferences: vi.fn().mockResolvedValue(undefined),
    refreshPreferences: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: () => notificationContext.value,
}));

describe("NotificationInbox", () => {
  beforeEach(() => {
    notificationContext.value.refresh.mockClear();
    notificationContext.value.markAsRead.mockClear();
    notificationContext.value.markAllAsRead.mockClear();
    notificationContext.value.deleteNotification.mockClear();
    notificationContext.value.savePreferences.mockClear();
  });

  it("renders real notification data and supports read actions", async () => {
    render(<NotificationInbox isOpen onClose={vi.fn()} />);

    expect(screen.getByText("New scholarship match")).toBeInTheDocument();
    expect(screen.getByText("1 unread alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mark read/i }));

    await waitFor(() => {
      expect(notificationContext.value.markAsRead).toHaveBeenCalledWith(
        "notice-1",
      );
    });
  });

  it("does not render when closed", () => {
    render(<NotificationInbox isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });
});
