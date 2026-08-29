import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemberSettingsPanel from "../../components/MemberSettingsPanel";
import { ToastProvider } from "../../components/ui/ToastProvider";
import type { UserSettings } from "../../services/userSettings";

function renderPanel() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <MemberSettingsPanel />
      </ToastProvider>
    </MemoryRouter>,
  );
}

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
  getSessions: vi.fn().mockResolvedValue([]),
  updatePassword: vi.fn().mockResolvedValue({}),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: clerkMocks.getToken,
    sessionId: "sess_current",
  }),
  useUser: () => ({
    user: {
      id: "user_1",
      passwordEnabled: true,
      getSessions: clerkMocks.getSessions,
      updatePassword: clerkMocks.updatePassword,
    },
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
    clerkMocks.getSessions.mockClear();
    clerkMocks.getSessions.mockResolvedValue([]);
    clerkMocks.updatePassword.mockClear();
    serviceMocks.getUserSettings.mockResolvedValue(settingsFixture);
    serviceMocks.savePrivacySettings.mockResolvedValue({ success: true });
  });

  it("saves profile visibility as soon as an option is picked", async () => {
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: /profile visibility/i }),
    );
    fireEvent.click(await screen.findByRole("radio", { name: /private/i }));

    await waitFor(() => {
      expect(serviceMocks.savePrivacySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          profileVisibility: "private",
        }),
        "token-123",
      );
    });
  });

  it("saves a privacy toggle on change and reverts it when the save fails", async () => {
    serviceMocks.savePrivacySettings.mockResolvedValue({
      success: false,
      error: "offline",
    });

    renderPanel();

    const toggle = await screen.findByRole("button", {
      name: /data sharing/i,
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    // Optimistic flip first…
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => {
      expect(serviceMocks.savePrivacySettings).toHaveBeenCalledWith(
        expect.objectContaining({ dataSharing: true }),
        "token-123",
      );
    });
    // …then revert on failure.
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("links to the notifications page from settings", async () => {
    renderPanel();

    await screen.findByText("Notification inbox");

    expect(
      screen.getByRole("link", { name: /notification inbox/i }),
    ).toHaveAttribute("href", "/app/notifications");
  });

  it("opens the in-app sign-in security sheet with password form and sessions", async () => {
    renderPanel();

    await screen.findByText("Notification inbox");
    fireEvent.click(screen.getByRole("button", { name: /sign-in security/i }));

    expect(
      await screen.findByRole("dialog", { name: /sign-in security/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByText("Active sessions")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: /sign-in security/i });
    expect(dialog.querySelector("[data-sheet-body]")).toBeInTheDocument();
    expect(dialog.querySelector("[data-sheet-actions]")).toBeInTheDocument();
    await waitFor(() => {
      expect(clerkMocks.getSessions).toHaveBeenCalledTimes(1);
    });
  });

  it("requires typing DELETE before an account deletion request is sent", async () => {
    serviceMocks.requestAccountDeletion.mockResolvedValue({ success: true });

    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /request account deletion/i,
      }),
    );

    const confirmButton = await screen.findByRole("button", {
      name: /request deletion/i,
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText("Type DELETE to confirm"),
      { target: { value: "DELETE" } },
    );
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    await waitFor(() => {
      expect(serviceMocks.requestAccountDeletion).toHaveBeenCalledWith(
        "token-123",
      );
    });
  });
});
