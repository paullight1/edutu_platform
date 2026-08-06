import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

// Regression cover for the Goals feature's information-architecture bugs:
// the create affordances that dead-ended on the dashboard, counts that were
// derived from the already-filtered list, and empty states that blamed the
// wrong thing when a search returned nothing.

type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category?: string;
  deadline?: string;
  progress: number;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  priority?: 'low' | 'medium' | 'high';
  source?: 'template' | 'custom' | 'imported';
  opportunity_title?: string;
};

const mockPush = jest.fn();
let mockGoalRows: Goal[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: { id: 'user-1', fullName: 'Amina Okafor' }, isLoaded: true }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      ...require('../test-utils/themeColors').TEST_THEME_COLORS,
      background: '#FFFFFF',
      foreground: '#111827',
      card: '#FFFFFF',
      border: '#E5E7EB',
      primary: '#2563EB',
      accent: '#2563EB',
    },
  }),
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, subtitle, showBack, right }: { title: string; subtitle?: string; showBack?: boolean; right?: React.ReactNode }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
        {right}
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

jest.mock('../components/ui/AdBanner', () => ({
  AdBanner: () => null,
}));

jest.mock('../components/goals/GoalCalendar', () => ({
  GoalCalendar: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/ui/ProgressBar', () => ({
  ProgressBar: ({ progress, size }: { progress?: number; size?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{`Progress:${Math.round(progress || 0)}:${size || 'md'}`}</Text>;
  },
}));

// The dashboard reads bookmarks straight off Supabase; a thenable stub keeps
// the promise chain resolvable without a network layer.
jest.mock('../lib/supabase', () => {
  const empty = { data: [], error: null };
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(empty).then(resolve),
  };
  return { supabase: { from: () => builder } };
});

jest.mock('../lib/notifications', () => ({
  notificationService: {
    scheduleGoalReminder: jest.fn(async () => null),
    cancelNotification: jest.fn(async () => undefined),
  },
}));

jest.mock('../lib/haptics', () => ({
  haptics: { success: jest.fn(), light: jest.fn(), medium: jest.fn() },
}));

jest.mock('../components/context/ToastContext', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({
    goals: mockGoalRows,
    isLoading: false,
    updateGoal: jest.fn(),
    deleteGoal: jest.fn(),
    createGoal: jest.fn(),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useCreditRewards', () => ({
  useCreditRewards: () => ({ award: jest.fn() }),
}), { virtual: true });

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (id: string) => id,
}), { virtual: true });

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

const MyListScreen = require('../app/(app)/goals/my-list').default;
const GoalsDashboard = require('../app/(app)/goals/index').default;

function findTouchable(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }
  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }
  return current;
}

function press(node: any) {
  act(() => {
    findTouchable(node).props.onPress?.();
  });
}

function customGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'Goal',
    progress: 0,
    status: 'active',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    priority: 'medium',
    source: 'custom',
    ...overrides,
  };
}

describe('goals create affordances', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGoalRows = [];
  });

  it('sends the My Goals header plus button to the create form, not the dashboard', () => {
    mockGoalRows = [customGoal({ id: 'g1', title: 'Draft personal statement' })];

    const { getByLabelText } = render(<MyListScreen />);

    press(getByLabelText('Add a goal'));

    expect(mockPush).toHaveBeenCalledWith('/goals/add');
    expect(mockPush).not.toHaveBeenCalledWith('/goals');
  });

  it('sends the empty-state CTA to the create form', () => {
    const { getByText } = render(<MyListScreen />);

    press(getByText('Create Goal'));

    expect(mockPush).toHaveBeenCalledWith('/goals/add');
  });
});

describe('goals counts', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGoalRows = [
      customGoal({ id: 'g1', title: 'Draft personal statement', status: 'active' }),
      customGoal({ id: 'g2', title: 'Ask for a reference', status: 'active' }),
      customGoal({ id: 'g3', title: 'Send the transcript', status: 'completed', progress: 100 }),
    ];
  });

  it('keeps the status-tab counts fixed to the whole list when a filter is applied', () => {
    const { getByLabelText } = render(<MyListScreen />);

    expect(getByLabelText('All, 3 goals')).toBeTruthy();

    press(getByLabelText('Completed, 1 goal'));

    // The counts describe the list, not the current view — they must not
    // collapse to the filtered result the moment a filter is chosen.
    expect(getByLabelText('All, 3 goals')).toBeTruthy();
    expect(getByLabelText('Active, 2 goals')).toBeTruthy();
  });
});

describe('goals dashboard', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGoalRows = [
      customGoal({ id: 'g1', title: 'Draft personal statement', status: 'active' }),
      customGoal({ id: 'g2', title: 'Send the transcript', status: 'completed', progress: 100 }),
      customGoal({ id: 'g3', title: 'Week 1 milestone', source: 'imported', opportunity_title: 'Mastercard Scholars' }),
    ];
  });

  it('renders the completion stat as a percentage, not a bare count', () => {
    const { getByText } = render(<GoalsDashboard />);

    // 1 of 3 complete — a bare "33" next to "Active 1" reads as a goal count.
    expect(getByText('33%')).toBeTruthy();
  });

  it('blames the search, not the empty account, when a search matches nothing', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<GoalsDashboard />);

    fireEvent.changeText(getByPlaceholderText('Search goals and plan steps'), 'zzzzz');

    expect(getByText('Nothing matches')).toBeTruthy();
    expect(queryByText("Nothing you've set yourself")).toBeNull();
    expect(queryByText('No plan steps yet')).toBeNull();
  });
});
