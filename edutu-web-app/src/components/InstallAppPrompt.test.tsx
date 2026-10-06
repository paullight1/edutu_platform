import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import usePWA from "../hooks/usePWA";
import InstallAppPrompt from "./InstallAppPrompt";

vi.mock("../hooks/usePWA", () => ({
  default: vi.fn(),
}));

const mockUsePWA = vi.mocked(usePWA);

function renderPrompt(path = "/opportunities") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InstallAppPrompt />
    </MemoryRouter>,
  );
}

function setPwaState(
  overrides: Partial<ReturnType<typeof usePWA>> = {},
) {
  mockUsePWA.mockReturnValue({
    isInstallable: false,
    isManualInstallAvailable: false,
    isInstalled: false,
    isUpdateAvailable: false,
    isOffline: false,
    promptInstall: vi.fn().mockResolvedValue(false),
    applyUpdate: vi.fn(),
    ...overrides,
  });
}

describe("InstallAppPrompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("edutu_cookie_consent", "accepted");
    vi.clearAllMocks();
  });

  it("shows the install popup on the dashboard", () => {
    setPwaState({ isInstallable: true });
    renderPrompt("/dashboard");
    expect(screen.getByRole("dialog", { name: "Add Edutu to your home screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add$/ })).toBeInTheDocument();
  });

  it("does not prompt dashboard users who already installed Edutu", () => {
    setPwaState({ isInstalled: true, isInstallable: true });
    renderPrompt("/app/home");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits until the first-visit cookie notice has cleared", async () => {
    window.localStorage.removeItem("edutu_cookie_consent");
    setPwaState({ isInstallable: true });

    renderPrompt("/dashboard");

    expect(
      screen.queryByRole("dialog", {
        name: "Add Edutu to your home screen",
      }),
    ).not.toBeInTheDocument();

    const cookieNotice = document.createElement("div");
    cookieNotice.setAttribute("role", "dialog");
    cookieNotice.setAttribute("aria-label", "Cookie consent");
    await act(async () => {
      document.body.appendChild(cookieNotice);
      await Promise.resolve();
    });
    await act(async () => {
      cookieNotice.remove();
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("dialog", {
        name: "Add Edutu to your home screen",
      }),
    ).toBeInTheDocument();
  });

  it("does not offer an Add action where native installation is unavailable", () => {
    setPwaState({ isManualInstallAvailable: true });
    renderPrompt("/dashboard");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add$/ })).not.toBeInTheDocument();
  });

  it("dismisses after an accepted browser install", async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    setPwaState({ isInstallable: true, promptInstall });

    renderPrompt("/dashboard");
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(promptInstall).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Add Edutu to your home screen",
        }),
      ).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("edutu_home_screen_prompt_dismissed"))
      .toBe("1");
  });
});
