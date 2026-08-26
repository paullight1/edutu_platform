import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileCompletionPrompt } from "./ProfileCompletionPrompt";
import {
  dismissProfilePromptForSession,
  readDismissedProfilePromptSession,
  shouldShowProfileCompletionPrompt,
} from "./profileCompletionPromptState";

vi.mock("../../hooks/usePersonalization", () => ({
  usePersonalization: () => ({
    preferences: {
      interests: [],
      careerGoals: [],
      educationLevel: "",
      experienceLevel: "intermediate",
      location: "",
    },
    savePreferences: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", name: "Ada Lovelace" } }),
}));

vi.mock("../ui/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../services/profile", () => ({
  saveOnboardingProfile: vi.fn().mockResolvedValue({ completed: true }),
  updateBackendProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../services/opportunityPreferences", () => ({
  syncOpportunityPreferences: vi.fn().mockResolvedValue(undefined),
}));

describe("profile prompt session dismissal", () => {
  it("survives a page remount within the same browser session", () => {
    window.sessionStorage.clear();

    dismissProfilePromptForSession(window.sessionStorage, "session-123");

    expect(readDismissedProfilePromptSession(window.sessionStorage)).toBe(
      "session-123",
    );
  });
});

describe("shouldShowProfileCompletionPrompt", () => {
  it("shows the prompt for a signed-in user below the matching threshold", () => {
    expect(
      shouldShowProfileCompletionPrompt({
        isSignedIn: true,
        profileScore: 42,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it.each([
    { isSignedIn: false, profileScore: 42, dismissed: false },
    { isSignedIn: true, profileScore: null, dismissed: false },
    { isSignedIn: true, profileScore: 60, dismissed: false },
    { isSignedIn: true, profileScore: 42, dismissed: true },
  ])("does not show outside the incomplete-profile state", (state) => {
    expect(shouldShowProfileCompletionPrompt(state)).toBe(false);
  });
});

describe("ProfileCompletionPrompt", () => {
  it("lets the user dismiss the prompt for now", () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ProfileCompletionPrompt
          open={open}
          missingFields={["Field of study", "Location"]}
          onComplete={() => undefined}
          onDismiss={() => setOpen(false)}
        />
      );
    }

    render(<Harness />);

    expect(
      screen.getByRole("dialog", { name: /welcome to edutu/i }),
    ).toBeInTheDocument();
    expect(screen.getByAltText(/edutu mascot/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /maybe later/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("starts the profile quiz inside the dialog", () => {
    const onComplete = vi.fn();

    render(
      <ProfileCompletionPrompt
        open
        missingFields={["Field of study"]}
        onComplete={onComplete}
        onDismiss={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /personalize my feed/i }),
    );

    expect(
      screen.getByRole("heading", { name: /tell us about you/i }),
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
