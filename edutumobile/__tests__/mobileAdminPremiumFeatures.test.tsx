import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

type FeatureFlag = {
  id: string;
  key: string;
  label: string;
  description: string;
  is_enabled: boolean;
  pro_required: boolean;
  sort_order: number;
};

const mockFeatureFlags: FeatureFlag[] = [
  {
    id: 'flag-1',
    key: 'ai_tutor',
    label: 'AI Tutor',
    description: 'Adaptive learning assistant',
    is_enabled: true,
    pro_required: false,
    sort_order: 1,
  },
  {
    id: 'flag-2',
    key: 'study_planner',
    label: 'Study Planner',
    description: 'Personalized study schedule',
    is_enabled: false,
    pro_required: true,
    sort_order: 2,
  },
  {
    id: 'flag-3',
    key: 'resume_builder',
    label: 'Resume Builder',
    description: 'Generate professional resumes',
    is_enabled: true,
    pro_required: true,
    sort_order: 3,
  },
];

const mockFeatureFlagUpdates: Array<{ payload: any; id: string }> = [];
const mockAlert = jest.spyOn(Alert, 'alert');

const mockSupabase = {
  from: jest.fn(),
};

function makeBuilder(table: string) {
  const state: { op: 'select' | 'update'; payload?: any; where?: { field: string; value: string } } = {
    op: 'select',
  };

  const builder: any = {
    select: () => {
      state.op = 'select';
      return builder;
    },
    order: () => builder,
    update: (payload: any) => {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    eq: (field: string, value: string) => {
      state.where = { field, value };
      if (state.op === 'update' && state.payload) {
        mockFeatureFlagUpdates.push({ payload: state.payload, id: value, table });
      }
      return builder;
    },
    then: (resolve: any, reject: any) => {
      Promise.resolve(resolveQuery(state)).then(resolve, reject);
    },
    catch: (reject: any) => Promise.resolve(resolveQuery(state)).catch(reject),
  };

  return builder;
}

function resolveQuery(state: { op: 'select' | 'update' }) {
  if (state.op === 'update') {
    return { data: null, error: null };
  }

  return { data: mockFeatureFlags, error: null };
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

jest.mock('../components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, ...props }: { children: React.ReactNode }) => {
    const React = require('react');
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity {...props}>{children}</TouchableOpacity>;
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

const AdminPremiumFeatures = require('../app/admin/premium-features').default;

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
      // Try the next matching text node until we reach the actual pressable chip.
    }
  }

  throw new Error('Could not find a pressable ancestor for the matching text nodes');
}

describe('Admin premium features screen', () => {
  beforeEach(() => {
    mockSupabase.from.mockClear();
    mockFeatureFlagUpdates.length = 0;
    mockAlert.mockClear();
    mockSupabase.from.mockImplementation((table: string) => makeBuilder(table));
  });

  it('filters, searches, and toggles feature flags', async () => {
    const { getAllByRole, getAllByText, getByPlaceholderText, getByText, queryByText } = render(
      <AdminPremiumFeatures />,
    );

    await waitFor(() => expect(getByText('AI Tutor')).toBeTruthy());
    expect(getByText('Total')).toBeTruthy();

    pressFirstPressable(getAllByText('Pro Only'));
    await waitFor(() => expect(queryByText('AI Tutor')).toBeNull());
    expect(getByText('Study Planner')).toBeTruthy();
    expect(getByText('Resume Builder')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Search features...'), 'Resume');
    await waitFor(() => expect(getByText('Resume Builder')).toBeTruthy());
    expect(queryByText('Study Planner')).toBeNull();
    expect(queryByText('AI Tutor')).toBeNull();

    const switches = getAllByRole('switch');
    await act(async () => {
      fireEvent(switches[0], 'valueChange', false);
    });
    await waitFor(() =>
      expect(mockFeatureFlagUpdates).toContainEqual(
        expect.objectContaining({
          id: 'flag-3',
          payload: expect.objectContaining({
            is_enabled: false,
          }),
        }),
      ),
    );

    await act(async () => {
      fireEvent(switches[1], 'valueChange', false);
    });
    await waitFor(() =>
      expect(mockFeatureFlagUpdates).toContainEqual(
        expect.objectContaining({
          id: 'flag-3',
          payload: expect.objectContaining({
            pro_required: false,
          }),
        }),
      ),
    );
  });

  it('validates required fields in the edit modal and saves updates', async () => {
    const { getAllByText, getByDisplayValue, getByPlaceholderText, getByText } = render(
      <AdminPremiumFeatures />,
    );

    await waitFor(() => expect(getByText('AI Tutor')).toBeTruthy());

    pressNearestTouchTarget(getAllByText('Pencil')[0]);
    await waitFor(() => expect(getByText('Edit Feature Flag')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('e.g. AI Tutor'), '');
    fireEvent.press(getByText('Update Feature Flag'));
    expect(mockAlert).toHaveBeenCalledWith('Validation Error', 'Label and description are required.');

    mockAlert.mockClear();
    fireEvent.changeText(getByDisplayValue('Adaptive learning assistant'), 'Adaptive learning assistant for every learner');
    fireEvent.changeText(getByPlaceholderText('e.g. AI Tutor'), 'AI Tutor Plus');
    fireEvent.changeText(getByPlaceholderText('0'), '7');

    await act(async () => {
      fireEvent.press(getByText('Update Feature Flag'));
    });

    await waitFor(() =>
      expect(mockFeatureFlagUpdates).toContainEqual(
        expect.objectContaining({
          id: 'flag-1',
          payload: expect.objectContaining({
            label: 'AI Tutor Plus',
            description: 'Adaptive learning assistant for every learner',
            sort_order: 7,
          }),
        }),
      ),
    );
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Feature flag updated successfully.');
  });
});
