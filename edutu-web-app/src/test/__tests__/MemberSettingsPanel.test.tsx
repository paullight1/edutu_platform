import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemberSettingsPanel from "../../components/MemberSettingsPanel";
import type { UserSettings } from "../../services/userSettings";

const settingsFixture: UserSettings = {
  privacy: {
    profileVisibility: "public",
    dataSharing: false,
    analyticsTracking: true,
    personalizedAds: false,
    activityStatus: true,
    searchVisibility: true,
  },
  security: {
    twoFactorEnabled: false,
    lastPasswordUpdate: null,
    lastDataDownload: null,
  },
  updatedAt: "2026-06-18T10:00:00.000Z",
};

const serviceMocks = vi.hoisted(() => ({
  exportUserData: vi.fn(),
  getUserSettings: vi.fn(),
  requestAccountDeletion: vi.fn(),
  savePrivacySettings: vi.fn(),
}));

const clerkMocks = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue("token-123"),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: clerkMocks.getToken,
  }),
}));

vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleDarkMode: vi.fn(),
  }),
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: () => ({
    unreadCount: 2,
  }),
}));

vi.mock("../../services/userSettings", () => serviceMocks);

describe("MemberSettingsPanel", () => {
  beforeEach(() => {
    serviceMocks.exportUserData.mockReset();
    serviceMocks.getUserSettings.mockReset();
    serviceMocks.requestAccountDeletion.mockReset();
    serviceMocks.savePrivacySettings.mockReset();
    clerkMocks.getToken.mockClear();
    clerkMocks.getToken.mockResolvedValue("token-123");
    serviceMocks.getUserSettings.mockResolvedValue(settingsFixture);
    serviceMocks.savePrivacySettings.mockResolvedValue({ success: true });
  });

  it("loads privacy settings and saves profile visibility changes", async () => {
    render(<MemberSettingsPanel onOpenNotifications={vi.fn()} />);

    const visibility = await screen.findByLabelText(/profile visibility/i);
    fireEvent.change(visibility, { target: { value: "private" } });
    fireEvent.click(screen.getByRole("button", { name: /save privacy/i }));

    await waitFor(() => {
      expect(serviceMocks.savePrivacySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          profileVisibility: "private",
        }),
        "token-123",
      );
    });
  });

  it("opens the notification panel from settings", async () => {
    const openNotifications = vi.fn();

    render(<MemberSettingsPanel onOpenNotifications={openNotifications} />);

    await screen.findByText("Inbox and reminders");
    fireEvent.click(
      screen.getByRole("button", { name: /inbox and reminders/i }),
    );

    expect(openNotifications).toHaveBeenCalledTimes(1);
  });
});
