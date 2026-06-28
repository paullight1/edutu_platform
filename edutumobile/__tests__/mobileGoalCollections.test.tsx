import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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
  completed_at?: string | null;
  priority?: 'low' | 'medium' | 'high';
  source?: 'template' | 'custom' | 'imported';
  template_id?: string;
  roadmap_id?: string;
  opportunity_title?: string;
};

const mockPush = jest.fn();
const mockGoals: Goal[] = [];
let mockGoalRows: Goal[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: { id: 'user-1', fullName: 'Amina Okafor' },
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

jest.mock('../lib/supabase', () => ({
  supabase: {},
}));

jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({
    goals: mockGoalRows,
    updateGoal: jest.fn(),
    deleteGoal: jest.fn(),
    createGoal: jest.fn(),
  }),
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

const AllRoadmapsScreen = require('../app/(app)/goals/all-roadmaps').default;
const MyListScreen = require('../app/(app)/goals/my-list').default;

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

function pressByText(getByText: (text: string) => any, label: string) {
  act(() => {
    findTouchable(getByText(label)).props.onPress?.();
  });
}

describe('mobile goal collections', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGoalRows = [];
  });

  it('filters roadmap goals by search term and switches between grid and list views', () => {
    mockGoalRows = [
      {
        id: 'g-1',
        user_id: 'user-1',
        title: 'Submit Mastercard essay',
        opportunity_title: 'Mastercard Scholars',
        status: 'active',
        progress: 40,
        priority: 'high',
        source: 'imported',
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
        deadline: '2030-02-01T00:00:00.000Z',
      },
      {
        id: 'g-2',
        user_id: 'user-1',
        title: 'Gather transcript',
        opportunity_title: 'Mastercard Scholars',
        status: 'active',
        progress: 10,
        priority: 'medium',
        source: 'imported',
        created_at: '2026-06-21T00:00:00.000Z',
        updated_at: '2026-06-21T00:00:00.000Z',
      },
      {
        id: 'g-3',
        user_id: 'user-1',
        title: 'Personal goal',
        status: 'active',
        progress: 0,
        priority: 'low',
        source: 'custom',
        created_at: '2026-06-20T00:00:00.000Z',
        updated_at: '2026-06-20T00:00:00.000Z',
      },
    ];

    const { getByPlaceholderText, getByText, queryByText } = render(<AllRoadmapsScreen />);

    expect(getByText('Roadmap Goals')).toBeTruthy();
    expect(getByText('Mastercard Scholars')).toBeTruthy();
    expect(getByText('Submit Mastercard essay')).toBeTruthy();
    expect(getByText('Gather transcript')).toBeTruthy();
    expect(queryByText('Personal goal')).toBeNull();

    pressByText(getByText, 'List');
    expect(getByText('Submit Mastercard essay')).toBeTruthy();
    expect(getByText('Gather transcript')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Search roadmaps...'), 'gather');
    expect(getByText('Gather transcript')).toBeTruthy();
    expect(queryByText('Submit Mastercard essay')).toBeNull();

    fireEvent.changeText(getByPlaceholderText('Search roadmaps...'), 'nothing');
    expect(getByText('No roadmap goals')).toBeTruthy();
    expect(getByText('Try adjusting your search')).toBeTruthy();
  });

  it('filters custom goals by status, opens the sort modal, and routes from the empty CTA', () => {
    mockGoalRows = [
      {
        id: 'c-1',
        user_id: 'user-1',
        title: 'Update scholarship essay',
        description: 'Draft the essay',
        status: 'active',
        progress: 60,
        priority: 'high',
        source: 'custom',
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
        deadline: '2030-02-01T00:00:00.000Z',
      },
      {
        id: 'c-2',
        user_id: 'user-1',
        title: 'Review recommendation letter',
        description: 'Follow up with referee',
        status: 'completed',
        progress: 100,
        priority: 'medium',
        source: 'custom',
        created_at: '2026-06-21T00:00:00.000Z',
        updated_at: '2026-06-21T00:00:00.000Z',
      },
      {
        id: 'c-3',
        user_id: 'user-1',
        title: 'Imported roadmap item',
        status: 'active',
        progress: 20,
        priority: 'low',
        source: 'imported',
        created_at: '2026-06-20T00:00:00.000Z',
        updated_at: '2026-06-20T00:00:00.000Z',
      },
    ];

    const { getAllByText, getByPlaceholderText, getByText, queryByText } = render(<MyListScreen />);

    expect(getByText('My Goals')).toBeTruthy();
    expect(getAllByText('2').length).toBeGreaterThan(0);
    expect(getByText(/Stay Focused/)).toBeTruthy();
    expect(getByText('Update scholarship essay')).toBeTruthy();
    expect(getByText('Review recommendation letter')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Search goals...'), 'essay');
    expect(getByText('Update scholarship essay')).toBeTruthy();
    expect(queryByText('Review recommendation letter')).toBeNull();

    fireEvent.changeText(getByPlaceholderText('Search goals...'), '');
    pressByText(getByText, 'Completed');
    expect(getByText('Review recommendation letter')).toBeTruthy();
    expect(queryByText('Update scholarship essay')).toBeNull();

    pressByText(getByText, 'Sort: Newest First');
    expect(getByText('Sort By')).toBeTruthy();
    pressByText(getByText, 'Title (A-Z)');
    expect(getByText('Sort: Title (A-Z)')).toBeTruthy();
  });

  it('routes from the empty goals CTA when no custom goals exist', () => {
    mockGoalRows = [];

    const { getByText } = render(<MyListScreen />);

    expect(getByText('No goals yet')).toBeTruthy();
    pressByText(getByText, 'Create Goal');

    expect(mockPush).toHaveBeenCalledWith('/goals');
  });
});
