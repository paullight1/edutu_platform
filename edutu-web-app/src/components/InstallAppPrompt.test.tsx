import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import usePWA from "../hooks/usePWA";
import InstallAppPrompt from "./InstallAppPrompt";

vi.mock("../hooks/usePWA", () => ({
  default: vi.fn(),
}));

const mockUsePWA = vi.mocked(usePWA);

function renderPrompt() {
  return render(
    <MemoryRouter initialEntries={["/opportunities"]}>
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

  it("waits until the first-visit cookie notice has cleared", async () => {
    window.localStorage.removeItem("edutu_cookie_consent");
    setPwaState({ isManualInstallAvailable: true });

    renderPrompt();

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

  it("presents the manual iOS flow as two scannable steps", () => {
    setPwaState({ isManualInstallAvailable: true });

    renderPrompt();

    expect(
      screen.getByRole("dialog", {
        name: "Add Edutu to your home screen",
      }),
    ).toBeInTheDocument();

    const instructions = screen.getByRole("list", {
      name: "How to add Edutu on iPhone or iPad",
    });
    const steps = within(instructions).getAllByRole("listitem");

    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent("Tap Share in Safari");
    expect(steps[1]).toHaveTextContent("Choose Add to Home Screen");
  });

  it("dismisses after an accepted browser install", async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    setPwaState({ isInstallable: true, promptInstall });

    renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Install Edutu" }));

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
