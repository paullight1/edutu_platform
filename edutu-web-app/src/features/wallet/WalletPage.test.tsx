import "../../i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const { request, refreshBilling } = vi.hoisted(() => ({ request: vi.fn(), refreshBilling: vi.fn() }));
vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>("../workspace/shared")),
  useProductSession: () => ({ request, token: vi.fn().mockResolvedValue("test-token"), userId: "user-test" }),
}));
vi.mock("../../hooks/usePaywall", () => ({ usePaywall: () => ({ refreshBilling }) }));

import WalletPage from "./WalletPage";

beforeEach(() => {
  request.mockImplementation((path: string) => {
    if (path === "/billing/status") return Promise.resolve({
      isPro: true, planTier: "pro", proSince: null, proExpiresAt: "2026-11-03T10:00:00.000Z",
      credits: 40, subscriptionStatus: "active", entitlements: ["cv_ai"], featureAccess: {}, transactions: [],
    });
    if (path === "/billing/user-catalog") return Promise.resolve({
      checkoutEnabled: false,
      products: [{ productKey: "pro_monthly_pass", amountMinor: 1500, currency: "USD", creditQuantity: null, renewalMode: "one_time", cadence: "monthly", validityDays: 31, fulfillmentKind: "subscription" }],
    });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});

it("shows server-confirmed plan access and catalog terms", async () => {
  render(<MemoryRouter><WalletPage /></MemoryRouter>);
  expect(await screen.findByText("Pro", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("active")).toBeInTheDocument();
  expect(screen.getByText(/Pro Monthly/)).toBeInTheDocument();
  expect(screen.getByText("31 days of access")).toBeInTheDocument();
  expect(screen.getByText("One-time purchase · no automatic renewal")).toBeInTheDocument();
  expect(refreshBilling).toHaveBeenCalled();
});
