import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileCompletionPrompt } from "./ProfileCompletionPrompt";
import {
  dismissProfilePromptForSession,
  readDismissedProfilePromptSession,
  shouldShowProfileCompletionPrompt,
} from "./profileCompletionPromptState";

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
      screen.getByRole("dialog", { name: /meet opportunities picked for you/i }),
    ).toBeInTheDocument();
    expect(screen.getByAltText(/edutu mascot/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /maybe later/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("starts profile completion from the primary action", () => {
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
      screen.getByRole("button", { name: /complete my profile/i }),
    );

    expect(onComplete).toHaveBeenCalledOnce();
  });
});
