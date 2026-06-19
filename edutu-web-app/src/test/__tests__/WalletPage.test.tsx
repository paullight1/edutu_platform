import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../../hooks/useTheme";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WalletPage from "../../components/WalletPage";

const serviceMocks = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  getTransactionHistory: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue("token-123"),
  }),
  useClerk: () => ({
    signOut: vi.fn(),
  }),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "user_123",
      name: "Test User",
      email: "test@example.com",
    },
    loading: false,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    signOut: vi.fn(),
    setUser: vi.fn(),
  }),
}));

vi.mock("../../hooks/useBillingStatus", () => ({
  useBillingStatus: () => ({
    status: {
      isPro: true,
      proSince: "2026-06-01T00:00:00.000Z",
      proExpiresAt: "2026-07-01T00:00:00.000Z",
      credits: 42,
      subscriptionStatus: "active",
      entitlements: ["pro-search", "priority-support"],
      featureAccess: { proSearch: true, prioritySupport: true },
    },
    loading: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../services/billing", () => ({
  createCheckout: serviceMocks.createCheckout,
}));

vi.mock("../../services/credits", () => ({
  getTransactionHistory: serviceMocks.getTransactionHistory,
  formatCreditTransactionType: (type: string) => type,
}));

describe("WalletPage", () => {
  beforeEach(() => {
    serviceMocks.createCheckout.mockReset();
    serviceMocks.getTransactionHistory.mockReset();
    serviceMocks.getTransactionHistory.mockResolvedValue([
      {
        id: "tx-1",
        user_id: "user_123",
        amount: 12,
        type: "reward",
        description: "Referral reward",
        related_id: null,
        related_type: null,
        created_at: "2026-06-18T09:00:00.000Z",
      },
    ]);
  });

  it("renders billing status and transaction history", async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <WalletPage />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(
      await screen.findByText("Credits, plan, and billing"),
    ).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Referral reward")).toBeInTheDocument();
    });
  });
});
