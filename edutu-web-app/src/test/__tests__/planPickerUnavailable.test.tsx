import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlanPicker from "../../features/feature-access/PlanPicker";
import { ProductApiUnavailableError } from "../../services/productApi";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  checkout: vi.fn(),
  getToken: vi.fn().mockResolvedValue("session-token"),
  pricing: null as null | {
    currency: string;
    weeklyPrice: number;
    monthlyPrice: number;
    yearlyPrice: number;
    pro: { weeklyPrice: number; monthlyPrice: number; yearlyPrice: number };
  },
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user-1",
    getToken: mocks.getToken,
  }),
}));

vi.mock("../../services/productApi", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/productApi")
  >("../../services/productApi");
  return { ...actual, productApiRequest: mocks.request };
});

vi.mock("../../services/billing", () => ({ isBachsCheckoutEnabled: () => true, createCheckout: mocks.checkout }));

vi.mock("../../lib/proPricing", () => ({
  effectivePrice: vi.fn((pricing, period, tier) => pricing[tier][`${period}Price`]),
  formatMoney: vi.fn((amount, currency) => `${currency} ${amount}`),
  useProPricing: () => ({ pricing: mocks.pricing, loading: false }),
}));

describe("PlanPicker unavailable catalog recovery", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.checkout.mockReset();
    localStorage.clear();
    mocks.pricing = null;
  });

  it("shows web plan prices in the USD currency used by the Bachs catalog", async () => {
    mocks.pricing = {
      currency: "NGN",
      weeklyPrice: 2000,
      monthlyPrice: 6500,
      yearlyPrice: 60000,
      pro: { weeklyPrice: 5, monthlyPrice: 15, yearlyPrice: 150 },
    };
    mocks.request.mockResolvedValueOnce({ products: [], checkoutEnabled: false });

    render(
      <MemoryRouter>
        <PlanPicker />
      </MemoryRouter>,
    );

    expect(await screen.findByText("USD 15")).toBeInTheDocument();
    expect(screen.queryByText("NGN 15")).not.toBeInTheDocument();
  });

  it("explains an unreachable API and offers retry without suggesting a pending payment", async () => {
    mocks.request.mockRejectedValueOnce(
      new ProductApiUnavailableError("Failed to fetch"),
    );

    render(
      <MemoryRouter>
        <PlanPicker />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t reach Edutu just now. Check your connection and try again.",
    );
    expect(
      screen.queryByText("Open wallet and check pending payments"),
    ).not.toBeInTheDocument();

    mocks.request.mockResolvedValueOnce({ products: [], checkoutEnabled: false });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("normalizes the browser-native failed-fetch error", async () => {
    mocks.request.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(
      <MemoryRouter>
        <PlanPicker />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t reach Edutu just now. Check your connection and try again.",
    );
    expect(
      screen.queryByText("Open wallet and check pending payments"),
    ).not.toBeInTheDocument();
  });
  it("starts the selected product from the docked checkout action", async () => {
    mocks.request.mockResolvedValueOnce({ checkoutEnabled: true, products: [
      { productKey: "pro_monthly_pass", amountMinor: 1500, currency: "USD", cadence: "monthly", renewalMode: "one_time", validityDays: 30 },
      { productKey: "pro_yearly_pass", amountMinor: 15000, currency: "USD", cadence: "yearly", renewalMode: "one_time", validityDays: 365 },
    ] });
    mocks.checkout.mockResolvedValueOnce({ intentId: "intent-1", checkoutUrl: "https://pay.edutu.org/handoff", renewalMode: "one_time" });
    render(<MemoryRouter><PlanPicker compact docked /></MemoryRouter>);
    const yearly = await screen.findByRole("button", { name: /yearly.*150/i });
    fireEvent.click(yearly);
    expect(yearly).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Continue to checkout/i }));
    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledWith("session-token", expect.objectContaining({ productKey: "pro_yearly_pass" }), "consumer"));
    expect(await screen.findByRole("button", { name: /Continue to secure checkout/i })).toBeInTheDocument();
  });

  it("does not offer a repeated availability action when the server disables checkout", async () => {
    mocks.request.mockResolvedValueOnce({ checkoutEnabled: false, products: [] });
    render(<MemoryRouter><PlanPicker compact docked /></MemoryRouter>);
    const action = await screen.findByRole("button", { name: "Checkout unavailable" });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

});
