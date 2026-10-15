import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WalletPage from "../../features/wallet/WalletPage";

const mocks = vi.hoisted(() => ({ request: vi.fn(), refreshBilling: vi.fn() }));

vi.mock("../../features/workspace/shared", async () => {
  const React = await import("react");
  return {
    FeaturePage: ({ children, actions, title }: { children: React.ReactNode; actions: React.ReactNode; title: string }) => (
      <main><h1>{title}</h1>{actions}{children}</main>
    ),
    FeatureError: () => null,
    Loading: () => <div role="status">Loading wallet</div>,
    errorMessage: (error: unknown) => error instanceof Error ? error.message : "Request failed",
    useProductSession: () => ({
      request: mocks.request,
      token: vi.fn().mockResolvedValue("clerk-session"),
      userId: "user_wallet_test",
    }),
    WorkspaceText: ({ value }: { value: string }) => <>{value}</>,
  };
});

vi.mock("../../features/feature-access/AccessSummary", () => ({ default: () => null }));
vi.mock("../../hooks/usePaywall", () => ({ usePaywall: () => ({ refreshBilling: mocks.refreshBilling }) }));

describe("wallet Bachs checkout return", () => {
  const intentId = "f5f3e53e-a1c2-4cb1-a886-123456789abc";

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/billing/status") {
        return {
          planTier: "none",
          subscriptionStatus: null,
          entitlements: [],
          credits: 0,
          proExpiresAt: null,
          transactions: [],
        };
      }
      if (path === "/billing/user-catalog") {
        return { products: [], checkoutEnabled: true };
      }
      if (path === `/billing/intents/${intentId}`) {
        return {
          intentId,
          productKey: "pro_monthly_pass",
          status: "processing",
          fulfilled: false,
          expiresAt: "2026-10-15T12:00:00.000Z",
        };
      }
      throw new Error(`Unexpected billing request: ${path}`);
    });
  });

  it("treats the Bachs return URL as a lookup hint and shows only API-verified status", async () => {
    render(
      <MemoryRouter initialEntries={[`/app/wallet?checkout=success&intentId=${intentId}`]}>
        <WalletPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(`/billing/intents/${intentId}`);
    });
    expect(await screen.findByRole("heading", { name: "Payment status" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("Provider status: Processing")).toBeInTheDocument();
    expect(screen.getByText(/returning to edutu does not confirm a payment/i)).toBeInTheDocument();
  });

  it("does not report payment success when the return reference is malformed", async () => {
    render(
      <MemoryRouter initialEntries={["/app/wallet?checkout=success&intentId=not-a-uuid"]}>
        <WalletPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/could not verify that checkout reference/i)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalledWith(expect.stringContaining("/billing/intents/"));
    expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument();
  });
});
