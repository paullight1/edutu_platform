import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

type CreatorApplication = {
  id: string;
  user_id: string;
  motivation: string;
  opportunity_type: string;
  opportunity_title: string;
  linkedin_url: string;
  proof_url: string;
  portfolio_url: string;
  bio: string;
  social_links: string;
  kyc_image_url: string;
  status: 'pending' | 'approved' | 'rejected';
  applied_at: string;
  reviewed_at: string | null;
  reviewer_notes: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

const mockApplications: CreatorApplication[] = [
  {
    id: 'app-1',
    user_id: 'user-1',
    motivation: 'I want to mentor students and share scholarship wins.',
    opportunity_type: 'scholarship',
    opportunity_title: 'Global Scholarship',
    linkedin_url: 'https://linkedin.com/in/amina',
    proof_url: 'https://example.com/proof-1',
    portfolio_url: 'https://example.com/portfolio-1',
    bio: 'Scholarship applicant and community builder.',
    social_links: '@amina',
    kyc_image_url: 'https://example.com/kyc-1.png',
    status: 'pending',
    applied_at: '2026-06-22T09:00:00.000Z',
    reviewed_at: null,
    reviewer_notes: '',
  },
  {
    id: 'app-2',
    user_id: 'user-2',
    motivation: 'I review opportunities for a living.',
    opportunity_type: 'mentor',
    opportunity_title: 'Mentor Network',
    linkedin_url: '',
    proof_url: '',
    portfolio_url: '',
    bio: 'Seasoned mentor.',
    social_links: '',
    kyc_image_url: '',
    status: 'approved',
    applied_at: '2026-06-21T09:00:00.000Z',
    reviewed_at: '2026-06-22T09:30:00.000Z',
    reviewer_notes: 'Previously approved.',
  },
];

const mockProfiles: ProfileRow[] = [
  { user_id: 'user-1', full_name: 'Amina Okafor', email: 'amina@example.com' },
  { user_id: 'user-2', full_name: 'Musa Bello', email: 'musa@example.com' },
];

const mockRpc = jest.fn();
const mockInvoke = jest.fn().mockResolvedValue({ data: null, error: null });
const mockApplicationUpdates: Array<{ payload: any; id: string }> = [];
const mockProfileUpdates: Array<{ payload: any; userId: string }> = [];
const mockAlert = jest.spyOn(Alert, 'alert');

const mockSupabase = {
  from: jest.fn(),
  rpc: (...args: unknown[]) => mockRpc(...args),
  functions: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
};

function makeBuilder(table: string) {
  const state: {
    op: 'select' | 'update';
    selectArg?: string;
    payload?: any;
    where?: { field: string; value: string };
    inValues?: string[];
  } = {
    op: 'select',
  };

  const builder: any = {
    select: (arg?: string) => {
      state.op = 'select';
      state.selectArg = arg;
      return builder;
    },
    order: () => builder,
    in: (_field: string, values: string[]) => {
      state.inValues = values;
      return builder;
    },
    update: (payload: any) => {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    eq: (field: string, value: string) => {
      state.where = { field, value };
      if (state.op === 'update' && state.payload) {
        if (table === 'creator_applications') {
          mockApplicationUpdates.push({ payload: state.payload, id: value });
        }
        if (table === 'profiles') {
          mockProfileUpdates.push({ payload: state.payload, userId: value });
        }
      }
      return builder;
    },
    single: async () => resolveQuery(table, state, true),
    then: (resolve: any, reject: any) => {
      Promise.resolve(resolveQuery(table, state)).then(resolve, reject);
    },
    catch: (reject: any) => Promise.resolve(resolveQuery(table, state)).catch(reject),
  };

  return builder;
}

function resolveQuery(table: string, state: {
  op: 'select' | 'update';
  selectArg?: string;
  where?: { field: string; value: string };
  inValues?: string[];
}, single = false) {
  if (table === 'creator_applications') {
    if (state.op === 'update') {
      return { data: null, error: null };
    }

    if (state.selectArg === 'user_id') {
      const application = mockApplications.find(app => app.id === state.where?.value);
      return { data: application ? { user_id: application.user_id } : null, error: null };
    }

    if (state.where?.field === 'status') {
      return {
        data: mockApplications.filter(app => app.status === state.where?.value),
        error: null,
      };
    }

    return { data: mockApplications, error: null };
  }

  if (table === 'profiles') {
    if (state.op === 'update') {
      return { data: null, error: null };
    }

    if (state.inValues?.length) {
      return {
        data: mockProfiles.filter(profile => state.inValues?.includes(profile.user_id)),
        error: null,
      };
    }

    return {
      data: single
        ? mockProfiles.find(profile => profile.user_id === state.where?.value) || null
        : mockProfiles,
      error: null,
    };
  }

  return { data: single ? null : [], error: null };
}

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: { id: 'admin-user', fullName: 'Admin User' },
    isLoaded: true,
  }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      card: '#FFFFFF',
      border: '#E5E7EB',
      primary: '#2563EB',
    },
  }),
}));

jest.mock('../components/auth/AdminGuard', () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, ...props }: { children: React.ReactNode }) => {
    const React = require('react');
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity {...props}>{children}</TouchableOpacity>;
  },
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, subtitle, showBack }: { title: string; subtitle?: string; showBack?: boolean }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  },
}));

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') {
          return () => <Text>{prop}</Text>;
        }
        return undefined;
      },
    },
  );
});

const AdminCreatorApplications = require('../app/admin/creator-applications').default;

function pressNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }

  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }

  act(() => {
    current.props.onPress?.();
  });
}

function pressFirstPressable(nodes: any[]) {
  for (const node of nodes) {
    try {
      pressNearestTouchTarget(node);
      return;
    } catch {
      // Keep searching until we hit the actual pressable chip.
    }
  }

  throw new Error('Could not find a pressable ancestor for the matching text nodes');
}

describe('Admin creator applications screen', () => {
  beforeEach(() => {
    mockSupabase.from.mockClear();
    mockRpc.mockReset();
    mockInvoke.mockClear();
    mockApplicationUpdates.length = 0;
    mockProfileUpdates.length = 0;
    mockAlert.mockClear();
    mockSupabase.from.mockImplementation((table: string) => makeBuilder(table));
    mockInvoke.mockResolvedValue({ data: null, error: null });
  });

  it('filters applications, shows details, and approves through the RPC path', async () => {
    mockRpc.mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    });

    const { getAllByText, getByPlaceholderText, getByText, queryByText } = render(
      <AdminCreatorApplications />,
    );

    await waitFor(() => expect(getByText('Global Scholarship')).toBeTruthy());
    expect(getByText('Amina Okafor')).toBeTruthy();
    expect(getAllByText('Pending').length).toBeGreaterThan(0);

    pressFirstPressable(getAllByText('Approved'));
    await waitFor(() => expect(getByText('Mentor Network')).toBeTruthy());
    expect(queryByText('Global Scholarship')).toBeNull();

    pressFirstPressable(getAllByText('All'));
    await waitFor(() => expect(getByText('Global Scholarship')).toBeTruthy());

    pressNearestTouchTarget(getByText('Global Scholarship'));
    await waitFor(() => expect(getByText('Application Details')).toBeTruthy());
    expect(getAllByText('Amina Okafor').length).toBeGreaterThan(0);
    expect(getAllByText('Scholarship').length).toBeGreaterThan(0);
    expect(getByText('https://example.com/proof-1')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Add a note about this decision...'), 'Strong fit for the program');
    await act(async () => {
      fireEvent.press(getByText('Approve'));
    });

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('review_creator_application', {
        p_application_id: 'app-1',
        p_status: 'approved',
        p_notes: 'Strong fit for the program',
      }),
    );
    expect(mockInvoke).toHaveBeenCalledWith('clerk-metadata', {
      body: {
        userId: 'user-1',
        metadata: { creatorStatus: 'approved' },
      },
    });
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Application approved successfully.');
    await waitFor(() => expect(queryByText('Application Details')).toBeNull());
  });

  it('falls back to direct table updates when the RPC review path fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('RPC unavailable'),
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { getByPlaceholderText, getByText } = render(<AdminCreatorApplications />);

    await waitFor(() => expect(getByText('Global Scholarship')).toBeTruthy());
    pressNearestTouchTarget(getByText('Global Scholarship'));
    await waitFor(() => expect(getByText('Application Details')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Add a note about this decision...'), 'Fallback review note');
    await act(async () => {
      fireEvent.press(getByText('Approve'));
    });

    await waitFor(() =>
      expect(mockApplicationUpdates).toContainEqual(
        expect.objectContaining({
          id: 'app-1',
          payload: expect.objectContaining({
            status: 'approved',
            reviewer_notes: 'Fallback review note',
          }),
        }),
      ),
    );
    expect(mockProfileUpdates).toContainEqual(
      expect.objectContaining({
        userId: 'user-1',
        payload: { creator_status: 'approved' },
      }),
    );
    expect(mockInvoke).toHaveBeenCalledWith('clerk-metadata', {
      body: {
        userId: 'user-1',
        metadata: { creatorStatus: 'approved' },
      },
    });
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Application approved successfully.');
    consoleErrorSpy.mockRestore();
  });
});
