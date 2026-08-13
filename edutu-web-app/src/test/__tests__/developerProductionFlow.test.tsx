import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeveloperDashboardPage from '../../components/DeveloperDashboardPage';

type BillingStatusMock = {
  credits: number;
  isPro: boolean;
  subscriptionStatus: null;
  proSince: null;
  proExpiresAt: null;
  entitlements: string[];
  featureAccess: Record<string, boolean>;
  transactions: Array<Record<string, unknown>>;
};

const mocks = vi.hoisted(() => ({
  getDeveloperDashboard: vi.fn(),
  createDeveloperProject: vi.fn(),
  rotateDeveloperProject: vi.fn(),
  revokeDeveloperProject: vi.fn(),
  createCheckout: vi.fn(),
  billingRefresh: vi.fn(),
  billingStatus: null as BillingStatusMock | null,
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
    mocks.billingStatus = {
      credits: 0,
      isPro: false,
      subscriptionStatus: null,
      proSince: null,
      proExpiresAt: null,
      entitlements: [],
      featureAccess: {},
      transactions: [],
    };
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
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

  it('uses the Clerk bearer session to create a project without requiring credits', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(mocks.getDeveloperDashboard).toHaveBeenCalledWith('token-123');
    });
    fireEvent.change(screen.getByDisplayValue('Scholarship Engine'), {
      target: { value: 'Fixture API project' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create project$/i }));

    await waitFor(() => {
      expect(mocks.createDeveloperProject).toHaveBeenCalledWith(
        'token-123',
        expect.objectContaining({
          name: 'Fixture API project',
          environment: 'live',
          scopes: expect.arrayContaining(['opportunities:read']),
        }),
      );
    });
    expect(await screen.findByText('edu_live_key')).toBeInTheDocument();
    expect(screen.getByText(/you have 0 api credits/i)).toBeInTheDocument();
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

    mocks.billingStatus = { ...mocks.billingStatus!, credits: 700 };
    view.rerender(
      <MemoryRouter initialEntries={['/dashboard/developer']}>
        <DeveloperDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/payment confirmed/i);
    expect(screen.getByText(/700 api credits available/i)).toBeInTheDocument();
  });

  it('does not confirm a purchase when its starting balance was unavailable', async () => {
    mocks.billingStatus = null;
    const view = renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /buy 100 credits/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continue to secure checkout/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/waiting for payment confirmation/i);
    expect(JSON.parse(sessionStorage.getItem('edutu.billing.dashboard-handoff') ?? '{}')).toMatchObject({
      startingCredits: null,
      state: 'pending',
    });

    mocks.billingStatus = {
      credits: 100,
      isPro: false,
      subscriptionStatus: null,
      proSince: null,
      proExpiresAt: null,
      entitlements: [],
      featureAccess: {},
      transactions: [],
    };
    view.rerender(
      <MemoryRouter initialEntries={['/dashboard/developer']}>
        <DeveloperDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/waiting for payment confirmation/i);
    expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument();
  });

  it('renders a cancelled checkout outcome for the matching stored intent', async () => {
    sessionStorage.setItem('edutu.billing.dashboard-handoff', JSON.stringify({
      intentId: 'intent-1',
      startingCredits: 0,
      state: 'pending',
      startedAt: Date.now(),
    }));
    window.history.replaceState({}, '', '/dashboard/developer?state=cancelled&intentId=intent-1');

    renderDashboard();

    expect(await screen.findByRole('status')).toHaveTextContent(/checkout was cancelled/i);
    expect(screen.queryByText(/waiting for payment confirmation/i)).not.toBeInTheDocument();
  });

  it('renders an expired outcome and clears the stale handoff after its safe TTL', async () => {
    sessionStorage.setItem('edutu.billing.dashboard-handoff', JSON.stringify({
      intentId: 'intent-1',
      startingCredits: 0,
      state: 'pending',
      startedAt: Date.now() - (30 * 60 * 1000 + 1),
    }));

    renderDashboard();

    expect(await screen.findByRole('status')).toHaveTextContent(/checkout session expired/i);
    expect(screen.queryByText(/waiting for payment confirmation/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('edutu.billing.dashboard-handoff')).toBeNull();
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
    mocks.billingStatus!.transactions = [
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
