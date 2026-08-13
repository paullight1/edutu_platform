import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeveloperDashboardPage from '../../components/DeveloperDashboardPage';

const mocks = vi.hoisted(() => ({
  getDeveloperDashboard: vi.fn(),
  createDeveloperProject: vi.fn(),
  rotateDeveloperProject: vi.fn(),
  revokeDeveloperProject: vi.fn(),
  createCheckout: vi.fn(),
  billingRefresh: vi.fn(),
  billingStatus: {
    credits: 0,
    isPro: false,
    subscriptionStatus: null,
    proSince: null,
    proExpiresAt: null,
    entitlements: [],
    featureAccess: {},
    transactions: [] as Array<Record<string, unknown>>,
  },
}));

const clerk = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue('token-123'),
  },
  user: { user: null },
}));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => clerk.auth,
  useUser: () => clerk.user,
}));
vi.mock('../../hooks/useDarkMode', () => ({ useDarkMode: () => ({ isDarkMode: false }) }));
vi.mock('../../services/developer', () => ({
  getDeveloperDashboard: mocks.getDeveloperDashboard,
  createDeveloperProject: mocks.createDeveloperProject,
  rotateDeveloperProject: mocks.rotateDeveloperProject,
  revokeDeveloperProject: mocks.revokeDeveloperProject,
}));
vi.mock('../../services/billing', async () => {
  const actual = await vi.importActual<typeof import('../../services/billing')>('../../services/billing');
  return {
    ...actual,
    createCheckout: mocks.createCheckout,
    isBachsCheckoutEnabled: () => true,
  };
});
vi.mock('../../hooks/useBillingStatus', () => ({
  useBillingStatus: () => ({
    status: mocks.billingStatus,
    products: [
      {
        productKey: 'api_credits_100',
        creditQuantity: 100,
        price: 1500,
        currency: 'NGN',
        label: 'Starter pack',
        renewalMode: 'one_time',
        validityDays: null,
      },
      {
        productKey: 'api_credits_700',
        creditQuantity: 700,
        price: 7000,
        currency: 'NGN',
        label: 'Builder pack',
        renewalMode: 'one_time',
        validityDays: null,
      },
    ],
    loading: false,
    productsLoading: false,
    error: null,
    errorCode: null,
    productsError: null,
    refresh: mocks.billingRefresh,
  }),
}));

function dashboardResponse() {
  return {
    account: { userId: 'user-1', email: 'dev@example.com' },
    summary: {
      totalProjects: 0,
      activeProjects: 0,
      totalRequestsThisMonth: 0,
      totalMonthlyQuota: 1000,
      totalRemainingQuota: 1000,
      unlimitedProjects: 0,
      latestActivityAt: null,
    },
    onboarding: [],
    projects: [],
    recentRequests: [],
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/developer']}>
      <DeveloperDashboardPage />
    </MemoryRouter>,
  );
}

describe('developer dashboard credit top-ups', () => {
  beforeEach(() => {
    mocks.getDeveloperDashboard.mockReset().mockResolvedValue(dashboardResponse());
    mocks.createDeveloperProject.mockReset().mockResolvedValue({
      rawKey: 'edu_live_key',
      project: { id: 'project-1' },
    });
    mocks.createCheckout.mockReset().mockResolvedValue({
      intentId: 'intent-1',
      checkoutUrl: 'https://checkout.bachs.io/session/1',
      expiresAt: '2026-08-13T12:00:00.000Z',
      renewalMode: 'one_time',
    });
    mocks.billingRefresh.mockReset();
    mocks.billingStatus.transactions = [];
    mocks.billingStatus.credits = 0;
    sessionStorage.clear();
    vi.stubGlobal('open', vi.fn().mockReturnValue(window));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a zero balance, configured packs, and keeps project creation enabled', async () => {
    renderDashboard();

    expect(await screen.findByText(/you have 0 api credits/i)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('One-time purchase.') && content.includes('Credits never expire.'))).toBeInTheDocument();
    expect(screen.getByText('Starter pack')).toBeInTheDocument();
    expect(screen.getByText('Builder pack')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create project/i })).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/recurring subscription/i);
  });

  it('uses the selected product key and keeps checkout idempotent', async () => {
    renderDashboard();

    const purchase = await screen.findByRole('button', { name: /buy 700 credits/i });
    fireEvent.click(purchase);

    await waitFor(() => {
      expect(mocks.createCheckout).toHaveBeenCalledWith(
        'token-123',
        expect.objectContaining({
          productKey: 'api_credits_700',
          returnSurface: 'web',
          idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      );
    });

    const firstInput = mocks.createCheckout.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: /continue to secure checkout/i }));
    expect(window.open).toHaveBeenCalledWith(
      'https://checkout.bachs.io/session/1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(firstInput).not.toHaveProperty('price');
    expect(firstInput).not.toHaveProperty('credits');
    expect(firstInput).not.toHaveProperty('currency');
  });

  it('keeps the dashboard handoff pending and refreshes billing when focus returns', async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /buy 100 credits/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continue to secure checkout/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/waiting for payment confirmation/i);

    fireEvent(window, new Event('focus'));

    await waitFor(() => expect(mocks.billingRefresh).toHaveBeenCalled());
  });

  it('shows a confirmed state after the returned balance increases', async () => {
    const view = renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /buy 700 credits/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continue to secure checkout/i }));

    mocks.billingStatus = { ...mocks.billingStatus, credits: 700 };
    view.rerender(
      <MemoryRouter initialEntries={['/dashboard/developer']}>
        <DeveloperDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/payment confirmed/i);
    expect(screen.getByText(/700 api credits available/i)).toBeInTheDocument();
  });

  it('explains unavailable checkout without claiming that credits were purchased', async () => {
    mocks.createCheckout.mockRejectedValueOnce(
      Object.assign(new Error('Checkout is temporarily unavailable.'), {
        status: 503,
        code: 'billing_unavailable',
      }),
    );
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /buy 100 credits/i }));

    expect(await screen.findByText(/checkout is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/try again later/i)).toBeInTheDocument();
    expect(screen.queryByText(/credits added/i)).not.toBeInTheDocument();
  });

  it('shows pending payment state with a safe balance retry action', async () => {
    mocks.billingStatus.transactions = [
      {
        id: 'transaction-1',
        provider: 'bachs',
        providerReference: null,
        type: 'credit_topup',
        amount: 700,
        currency: 'NGN',
        status: 'pending',
        description: 'API credit top-up',
        createdAt: null,
      },
    ];

    renderDashboard();

    expect(await screen.findByRole('status')).toHaveTextContent(/waiting for payment confirmation/i);
    fireEvent.click(screen.getByRole('button', { name: /check balance again/i }));
    expect(mocks.billingRefresh).toHaveBeenCalled();
  });
});
