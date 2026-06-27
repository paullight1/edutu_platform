import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ScholarshipApiPage from "../../components/ScholarshipApiPage";
import DeveloperDashboardPage from "../../components/DeveloperDashboardPage";

const serviceMocks = vi.hoisted(() => ({
  getDeveloperDashboard: vi.fn(),
  createDeveloperProject: vi.fn(),
  rotateDeveloperProject: vi.fn(),
  revokeDeveloperProject: vi.fn(),
  createCheckout: vi.fn(),
}));

const docsUrl = "https://docs.edutu.org";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue("token-123"),
  }),
  useUser: () => ({
    user: null,
  }),
}));

vi.mock("../../hooks/useDarkMode", () => ({
  useDarkMode: () => ({ isDarkMode: false }),
}));

vi.mock("../../hooks/useBillingStatus", () => ({
  useBillingStatus: () => ({
    status: {
      credits: 1200,
      isPro: false,
      subscriptionStatus: "active",
      proExpiresAt: null,
      transactions: [
        {
          id: "txn-1",
          provider: "paystack",
          providerReference: "ref_123",
          type: "credit_topup",
          amount: 1000,
          currency: "NGN",
          status: "completed",
          description: "API credit top-up for 1,000 credits",
          createdAt: "2026-06-22T10:00:00.000Z",
        },
      ],
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../services/developer", () => ({
  getDeveloperDashboard: serviceMocks.getDeveloperDashboard,
  createDeveloperProject: serviceMocks.createDeveloperProject,
  rotateDeveloperProject: serviceMocks.rotateDeveloperProject,
  revokeDeveloperProject: serviceMocks.revokeDeveloperProject,
}));

vi.mock("../../services/billing", () => ({
  createCheckout: serviceMocks.createCheckout,
}));

function renderScholarshipApiPage() {
  return render(
    <MemoryRouter initialEntries={["/scholarship-engine"]}>
      <ScholarshipApiPage />
    </MemoryRouter>,
  );
}

function renderDeveloperDashboardPage() {
  return render(
    <MemoryRouter initialEntries={["/developers"]}>
      <DeveloperDashboardPage />
    </MemoryRouter>,
  );
}

describe("Scholarship Engine pages", () => {
  beforeEach(() => {
    serviceMocks.getDeveloperDashboard.mockReset();
    serviceMocks.createDeveloperProject.mockReset();
    serviceMocks.rotateDeveloperProject.mockReset();
    serviceMocks.revokeDeveloperProject.mockReset();
    serviceMocks.createCheckout.mockReset();

    serviceMocks.getDeveloperDashboard.mockResolvedValue({
      account: {
        userId: "user-1",
        email: "dev@example.com",
      },
      summary: {
        totalProjects: 1,
        activeProjects: 1,
        totalRequestsThisMonth: 42,
        totalMonthlyQuota: 1000,
        totalRemainingQuota: 958,
        unlimitedProjects: 0,
        latestActivityAt: "2026-06-20T10:00:00.000Z",
      },
      onboarding: [
        { title: "Create a project", description: "Generate an API project." },
        { title: "Configure scopes", description: "Limit permissions." },
        { title: "Watch usage", description: "Track request counts." },
      ],
      projects: [
        {
          id: "consumer-1",
          name: "Scholarship Engine API",
          contactEmail: "dev@example.com",
          keyPrefix: "edu_live_a1b2c3d4",
          status: "active",
          plan: "starter",
          environment: "live",
          scopes: ["opportunities:read", "usage:read"],
          monthlyQuota: 1000,
          rateLimitPerMinute: 60,
          requestCount: 42,
          remainingQuota: 958,
          lastUsedAt: "2026-06-20T10:00:00.000Z",
          revokedAt: null,
          expiresAt: null,
          createdAt: "2026-06-19T08:00:00.000Z",
          updatedAt: "2026-06-20T10:00:00.000Z",
        },
      ],
      recentRequests: [
        {
          id: "usage-1",
          requestId: "req_123",
          method: "GET",
          endpoint: "/v1/opportunities",
          statusCode: 200,
          latencyMs: 88,
          createdAt: "2026-06-20T10:00:00.000Z",
          consumerId: "consumer-1",
          consumerName: "Scholarship Engine API",
          keyPrefix: "edu_live_a1b2c3d4",
          environment: "live",
        },
      ],
    });
    serviceMocks.createDeveloperProject.mockResolvedValue({
      rawKey: "edu_live_a1b2c3d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      project: {
        id: "consumer-2",
        name: "Scholarship Engine API",
        contactEmail: "dev@example.com",
        keyPrefix: "edu_live_a1b2c3d4",
        status: "active",
        plan: "starter",
        environment: "live",
        scopes: ["opportunities:read", "usage:read"],
        monthlyQuota: 1000,
        rateLimitPerMinute: 60,
        requestCount: 0,
        remainingQuota: 1000,
        lastUsedAt: null,
        revokedAt: null,
        expiresAt: null,
        createdAt: "2026-06-22T10:00:00.000Z",
        updatedAt: "2026-06-22T10:00:00.000Z",
      },
    });
    serviceMocks.rotateDeveloperProject.mockResolvedValue({
      rawKey: "edu_live_a1b2c3d4_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      project: {
        id: "consumer-1",
        name: "Scholarship Engine API",
        contactEmail: "dev@example.com",
        keyPrefix: "edu_live_a1b2c3d4",
        status: "active",
        plan: "starter",
        environment: "live",
        scopes: ["opportunities:read", "usage:read"],
        monthlyQuota: 1000,
        rateLimitPerMinute: 60,
        requestCount: 42,
        remainingQuota: 958,
        lastUsedAt: "2026-06-20T10:00:00.000Z",
        revokedAt: null,
        expiresAt: null,
        createdAt: "2026-06-19T08:00:00.000Z",
        updatedAt: "2026-06-22T10:00:00.000Z",
      },
    });
    serviceMocks.revokeDeveloperProject.mockResolvedValue(undefined);
    serviceMocks.createCheckout.mockResolvedValue({
      configured: true,
      authorizationUrl: "https://paystack.example/checkout",
      reference: "edutu_123",
      accessCode: "ac_123",
      provider: "paystack",
    });
  });

  it("renders the Scholarship Engine marketing page with docs and dashboard links", async () => {
    renderScholarshipApiPage();

    expect(
      await screen.findByText("One feed for scholarships and global opportunities."),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /open developer docs/i })).toHaveAttribute(
      "href",
      docsUrl,
    );
    expect(screen.getByRole("link", { name: /open dashboard/i })).toHaveAttribute(
      "href",
      "/developers",
    );
    expect(screen.getByRole("link", { name: /browse opportunities/i })).toHaveAttribute(
      "href",
      "/opportunities",
    );
  });

  it("loads the developer dashboard and supports project creation", async () => {
    renderDeveloperDashboardPage();

    expect(
      await screen.findByText(
        "Create projects, issue keys, and ship against the live scholarship graph.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("API credits")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Invoices & payments")).toBeInTheDocument();
    expect(screen.getByText("API credit top-up")).toBeInTheDocument();
    expect(screen.getByText("Request history")).toBeInTheDocument();
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    expect(screen.getAllByText("Scholarship Engine API")[0]).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read docs/i })).toHaveAttribute(
      "href",
      docsUrl,
    );
    expect(screen.getByRole("link", { name: /view marketing page/i })).toHaveAttribute(
      "href",
      "/scholarship-engine",
    );
    expect(screen.getByRole("button", { name: /buy 1,000 credits/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /rotate/i }));
    await waitFor(() => {
      expect(serviceMocks.rotateDeveloperProject).toHaveBeenCalledWith(
        "token-123",
        "consumer-1",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => {
      expect(serviceMocks.revokeDeveloperProject).toHaveBeenCalledWith(
        "token-123",
        "consumer-1",
      );
    });

    const projectNameInput = screen.getByDisplayValue("Scholarship Engine");
    fireEvent.change(projectNameInput, {
      target: { value: "Scholarship Engine Portal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create project/i }));

    await waitFor(() => {
      expect(serviceMocks.createDeveloperProject).toHaveBeenCalledWith(
        "token-123",
        expect.objectContaining({
          name: "Scholarship Engine Portal",
          environment: "live",
        }),
      );
    });

    expect(
      await screen.findByText(
        "edu_live_a1b2c3d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBeInTheDocument();
  });
});
