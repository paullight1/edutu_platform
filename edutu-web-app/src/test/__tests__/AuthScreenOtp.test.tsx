import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import AuthScreen from "../../components/AuthScreen";

const clerkMocks = vi.hoisted(() => ({
  createSignIn: vi.fn(),
  prepareFirstFactor: vi.fn(),
  attemptFirstFactor: vi.fn(),
  prepareSecondFactor: vi.fn(),
  attemptSecondFactor: vi.fn(),
  createSignUp: vi.fn(),
  prepareEmailAddressVerification: vi.fn(),
  attemptEmailAddressVerification: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ setActive: clerkMocks.setActive }),
  useSignIn: () => ({
    signIn: {
      create: clerkMocks.createSignIn,
      prepareFirstFactor: clerkMocks.prepareFirstFactor,
      attemptFirstFactor: clerkMocks.attemptFirstFactor,
      prepareSecondFactor: clerkMocks.prepareSecondFactor,
      attemptSecondFactor: clerkMocks.attemptSecondFactor,
    },
  }),
  useSignUp: () => ({
    signUp: {
      create: clerkMocks.createSignUp,
      prepareEmailAddressVerification:
        clerkMocks.prepareEmailAddressVerification,
      attemptEmailAddressVerification:
        clerkMocks.attemptEmailAddressVerification,
    },
  }),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ signInWithGoogle: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("AuthScreen OTP verification", () => {
  const enterCompletedOtp = (value: string) => {
    const input = screen.getByLabelText("auth.fields.verificationCode");
    fireEvent.change(input, { target: { value: value.slice(0, -1) } });
    fireEvent.change(input, { target: { value } });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/auth?mode=sign-in");

    clerkMocks.createSignIn.mockResolvedValue({
      status: "needs_second_factor",
      createdSessionId: null,
      supportedFirstFactors: null,
      supportedSecondFactors: [
        {
          strategy: "email_code",
          emailAddressId: "email_123",
          safeIdentifier: "m***@example.com",
        },
      ],
    });
    clerkMocks.prepareSecondFactor.mockResolvedValue(undefined);
    clerkMocks.prepareFirstFactor.mockResolvedValue(undefined);
    const completedSignIn = {
      status: "complete",
      createdSessionId: "session_123",
      supportedFirstFactors: null,
      supportedSecondFactors: null,
    };
    clerkMocks.attemptSecondFactor.mockImplementation(
      async ({ code }: { code: string }) => {
        if (code !== "307619") throw new Error("Incorrect code");
        return completedSignIn;
      },
    );
    clerkMocks.attemptFirstFactor.mockImplementation(
      async ({ code }: { code: string }) => {
        if (code !== "307619") throw new Error("Incorrect code");
        return completedSignIn;
      },
    );
    clerkMocks.createSignUp.mockResolvedValue({
      status: "missing_requirements",
      createdSessionId: null,
      createdUserId: "user_123",
    });
    clerkMocks.prepareEmailAddressVerification.mockResolvedValue(undefined);
    clerkMocks.attemptEmailAddressVerification.mockImplementation(
      async ({ code }: { code: string }) => {
        if (code !== "307619") throw new Error("Incorrect code");
        return {
          status: "complete",
          createdSessionId: "session_123",
          createdUserId: "user_123",
        };
      },
    );
    clerkMocks.setActive.mockResolvedValue(undefined);
  });

  test("submits all six digits on the first completed second-factor entry", async () => {
    const onAuthSuccess = vi.fn();
    render(
      <MemoryRouter>
        <AuthScreen onAuthSuccess={onAuthSuccess} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. ahmed@edutu.org"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "correct-password" },
    });
    fireEvent.submit(
      screen.getByPlaceholderText("Enter your password").closest("form")!,
    );

    expect(
      await screen.findByText("auth.titles.oneMoreStep"),
    ).toBeInTheDocument();

    enterCompletedOtp("307619");

    await waitFor(() => {
      expect(clerkMocks.attemptSecondFactor).toHaveBeenCalledWith({
        strategy: "email_code",
        code: "307619",
      });
      expect(clerkMocks.attemptSecondFactor).toHaveBeenCalledTimes(1);
      expect(onAuthSuccess).toHaveBeenCalledWith({
        email: "member@example.com",
      });
    });
  });

  test("submits all six digits on the first completed email sign-in entry", async () => {
    clerkMocks.createSignIn.mockResolvedValue({
      status: "needs_first_factor",
      createdSessionId: null,
      supportedFirstFactors: [
        {
          strategy: "email_code",
          emailAddressId: "email_123",
          safeIdentifier: "m***@example.com",
        },
      ],
      supportedSecondFactors: null,
    });
    const onAuthSuccess = vi.fn();
    render(
      <MemoryRouter>
        <AuthScreen onAuthSuccess={onAuthSuccess} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. ahmed@edutu.org"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "correct-password" },
    });
    fireEvent.submit(
      screen.getByPlaceholderText("Enter your password").closest("form")!,
    );

    expect(
      await screen.findByText("auth.titles.checkEmail"),
    ).toBeInTheDocument();

    enterCompletedOtp("307619");

    await waitFor(() => {
      expect(clerkMocks.attemptFirstFactor).toHaveBeenCalledWith({
        strategy: "email_code",
        code: "307619",
      });
      expect(clerkMocks.attemptFirstFactor).toHaveBeenCalledTimes(1);
      expect(onAuthSuccess).toHaveBeenCalledWith({
        email: "member@example.com",
      });
    });
  });

  test("submits all six digits on the first completed sign-up verification entry", async () => {
    window.history.replaceState({}, "", "/auth?signup=true");
    const onAuthSuccess = vi.fn();
    render(
      <MemoryRouter>
        <AuthScreen onAuthSuccess={onAuthSuccess} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Amina Bello"), {
      target: { value: "Edutu Member" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. ahmed@edutu.org"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "correct-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repeat your password"), {
      target: { value: "correct-password" },
    });
    fireEvent.submit(
      screen.getByPlaceholderText("Repeat your password").closest("form")!,
    );

    expect(
      await screen.findByText("auth.titles.checkEmail"),
    ).toBeInTheDocument();

    enterCompletedOtp("307619");

    await waitFor(() => {
      expect(
        clerkMocks.attemptEmailAddressVerification,
      ).toHaveBeenCalledWith({ code: "307619" });
      expect(
        clerkMocks.attemptEmailAddressVerification,
      ).toHaveBeenCalledTimes(1);
      expect(onAuthSuccess).toHaveBeenCalledWith({
        id: "user_123",
        email: "member@example.com",
        name: "Edutu Member",
      });
    });
  });

  test("normalizes a formatted OTP before the first automatic verification", async () => {
    const onAuthSuccess = vi.fn();
    render(
      <MemoryRouter>
        <AuthScreen onAuthSuccess={onAuthSuccess} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. ahmed@edutu.org"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "correct-password" },
    });
    fireEvent.submit(
      screen.getByPlaceholderText("Enter your password").closest("form")!,
    );

    expect(
      await screen.findByText("auth.titles.oneMoreStep"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("auth.fields.verificationCode"), {
      target: { value: "307 619" },
    });

    await waitFor(() => {
      expect(clerkMocks.attemptSecondFactor).toHaveBeenCalledWith({
        strategy: "email_code",
        code: "307619",
      });
      expect(clerkMocks.attemptSecondFactor).toHaveBeenCalledTimes(1);
      expect(onAuthSuccess).toHaveBeenCalledWith({
        email: "member@example.com",
      });
    });
  });
});
