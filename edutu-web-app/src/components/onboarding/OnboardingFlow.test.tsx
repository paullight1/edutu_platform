import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingFlow from "./OnboardingFlow";

const savePreferences = vi.fn().mockResolvedValue(undefined);

vi.mock("../../hooks/usePersonalization", () => ({
  usePersonalization: () => ({
    preferences: {
      interests: [],
      careerGoals: [],
      educationLevel: "",
      experienceLevel: "intermediate",
      location: "",
    },
    savePreferences,
  }),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Ada Lovelace" },
  }),
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

describe("OnboardingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("welcomes a first-time member with the mascot before asking questions", () => {
    render(
      <OnboardingFlow
        presentation="modal"
        showWelcome
        onComplete={() => undefined}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.getByText(/welcome to edutu, ada/i)).toBeInTheDocument();
    expect(screen.getByAltText(/edutu mascot/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /personalize my feed/i }),
    );

    expect(
      screen.getByRole("heading", { name: /tell us about you/i }),
    ).toBeInTheDocument();
  });

  it("preserves answers when moving back to an earlier step", () => {
    render(
      <OnboardingFlow
        presentation="modal"
        onComplete={() => undefined}
        onDismiss={() => undefined}
      />,
    );

    const name = screen.getByLabelText(/full name/i);
    fireEvent.change(name, { target: { value: "Ada N. Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByLabelText(/full name/i)).toHaveValue(
      "Ada N. Lovelace",
    );
  });

  it("allows a member to leave without saving", () => {
    const onDismiss = vi.fn();

    render(
      <OnboardingFlow
        presentation="modal"
        showWelcome
        onComplete={() => undefined}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /maybe later/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(savePreferences).not.toHaveBeenCalled();
  });
});
