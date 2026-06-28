import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

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
  reminder_enabled?: boolean;
  reminder_date?: string;
  reminder_sent?: boolean;
  notification_id?: string;
};

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockCreateGoal = jest.fn();
const mockUpdateGoal = jest.fn();
const mockDeleteGoal = jest.fn();
const mockToggleReminder = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert');

let mockRouteParams: { id?: string } = {};
let mockGoals: Goal[] = [];

const mockSupabase = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams, canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
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
  ScreenHeader: ({ title, showBack, right }: { title: string; showBack?: boolean; right?: React.ReactNode }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {right}
      </View>
    );
  },
}));

jest.mock('../components/ui/ProgressBar', () => ({
  ProgressBar: ({ progress, size }: { progress?: number; size?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{`Progress:${Math.round(progress || 0)}:${size || 'md'}`}</Text>;
  },
}));

jest.mock('../components/goals', () => ({
  PRIORITY_CONFIG: {
    high: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'High' },
    medium: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', label: 'Medium' },
    low: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Low' },
  },
  PRIORITY_OPTIONS: [
    { id: 'high', label: 'High', color: '#EF4444' },
    { id: 'medium', label: 'Medium', color: '#F59E0B' },
    { id: 'low', label: 'Low', color: '#10B981' },
  ],
  PRIORITY_OPTIONS_WITH_DESC: [
    { id: 'high', label: 'High Priority', color: '#EF4444', description: 'Urgent - needs immediate attention' },
    { id: 'medium', label: 'Medium Priority', color: '#F59E0B', description: 'Important - work on it soon' },
    { id: 'low', label: 'Low Priority', color: '#10B981', description: 'Can be done when you have time' },
  ],
}));

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({
    goals: mockGoals,
    createGoal: (...args: unknown[]) => mockCreateGoal(...args),
    updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
    deleteGoal: (...args: unknown[]) => mockDeleteGoal(...args),
    toggleReminder: (...args: unknown[]) => mockToggleReminder(...args),
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

const AddGoalScreen = require('../app/(app)/goals/add').default;
const GoalDetailScreen = require('../app/(app)/goals/[id]').default;

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

describe('mobile goal workflows', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSetParams.mockClear();
    mockCreateGoal.mockReset().mockResolvedValue({ id: 'goal-new' });
    mockUpdateGoal.mockReset().mockResolvedValue(undefined);
    mockDeleteGoal.mockReset().mockResolvedValue(undefined);
    mockToggleReminder.mockReset().mockResolvedValue(undefined);
    mockAlert.mockClear();
    mockRouteParams = {};
    mockGoals = [];
  });

  it('creates a new goal with valid data and routes home from the success alert', async () => {
    const { getByPlaceholderText, getByText } = render(<AddGoalScreen />);

    fireEvent.changeText(getByPlaceholderText('What do you want to achieve?'), 'Master scholarship applications');
    fireEvent.changeText(getByPlaceholderText('Add more details about this goal...'), 'Prepare documents and submit on time.');
    fireEvent.changeText(getByPlaceholderText('YYYY-MM-DD'), '2030-01-10');

    expect(findTouchable(getByText('Create Goal')).props.disabled).toBe(false);

    pressByText(getByText, 'Create Goal');

    await waitFor(() =>
      expect(mockCreateGoal).toHaveBeenCalledWith({
        title: 'Master scholarship applications',
        description: 'Prepare documents and submit on time.',
        priority: 'medium',
        deadline: new Date('2030-01-10').toISOString(),
        progress: 0,
        source: 'custom',
      }),
    );

    expect(mockAlert).toHaveBeenCalledWith(
      'Success',
      'Goal created successfully!',
      expect.any(Array),
    );

    const successButtons = mockAlert.mock.calls[mockAlert.mock.calls.length - 1][2];
    await act(async () => {
      successButtons[1].onPress?.();
    });

    expect(mockPush).toHaveBeenCalledWith('/goals');
  });

  it('keeps invalid goal inputs disabled and surfaces validation text', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<AddGoalScreen />);

    fireEvent.changeText(getByPlaceholderText('What do you want to achieve?'), 'ab');
    expect(getByText('Title must be at least 3 characters')).toBeTruthy();
    expect(findTouchable(getByText('Create Goal')).props.disabled).toBe(true);

    fireEvent.changeText(getByPlaceholderText('What do you want to achieve?'), 'Valid goal title');
    fireEvent.changeText(getByPlaceholderText('YYYY-MM-DD'), '2020-01-01');

    expect(getByText('Deadline cannot be in the past')).toBeTruthy();
    expect(getByText('Past date')).toBeTruthy();
    expect(findTouchable(getByText('Create Goal')).props.disabled).toBe(true);
    expect(queryByText('Goal created successfully!')).toBeNull();
  });

  it('edits, completes, reminds, deletes, and falls back when a goal is missing', async () => {
    const goal: Goal = {
      id: 'goal-1',
      user_id: 'user-1',
      title: 'Complete scholarship shortlist',
      description: 'Review essays and documents',
      category: 'Opportunity',
      deadline: '2030-02-01T00:00:00.000Z',
      progress: 40,
      status: 'active',
      created_at: '2026-06-22T00:00:00.000Z',
      updated_at: '2026-06-22T00:00:00.000Z',
      priority: 'medium',
      source: 'custom',
      reminder_enabled: false,
      reminder_sent: false,
    };

    mockGoals = [goal];
    mockRouteParams = { id: 'goal-1' };

    const { getByDisplayValue, getByPlaceholderText, getByText } = render(<GoalDetailScreen />);

    expect(getByText('Goal Details')).toBeTruthy();
    expect(getByText('Complete scholarship shortlist')).toBeTruthy();

    pressByText(getByText, 'Edit3');
    fireEvent.changeText(getByPlaceholderText('Goal title'), 'Updated scholarship shortlist');
    fireEvent.changeText(getByPlaceholderText('Add a description...'), 'Updated description');
    fireEvent.changeText(getByPlaceholderText('YYYY-MM-DD'), '2030-03-15');
    pressByText(getByText, 'High');
    pressByText(getByText, '75%');
    expect(getByDisplayValue('Updated scholarship shortlist')).toBeTruthy();
    pressByText(getByText, 'Save');

    await waitFor(() =>
      expect(mockUpdateGoal).toHaveBeenCalledWith('goal-1', expect.objectContaining({
        title: 'Updated scholarship shortlist',
        description: 'Updated description',
        priority: 'high',
        progress: 75,
        deadline: new Date('2030-03-15').toISOString(),
      })),
    );

    expect(mockAlert).toHaveBeenCalledWith('Success', 'Goal updated successfully');

    pressByText(getByText, 'Disabled');

    await waitFor(() =>
      expect(mockToggleReminder).toHaveBeenCalledWith('goal-1', true, '2030-02-01T00:00:00.000Z'),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      'Reminder Enabled',
      "You'll be reminded on " + new Date('2030-02-01T00:00:00.000Z').toLocaleDateString(),
    );

    pressByText(getByText, 'Mark as Complete');

    await waitFor(() =>
      expect(mockUpdateGoal).toHaveBeenCalledWith('goal-1', { status: 'completed', progress: 100 }),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      '🎉 Congratulations!',
      "You've completed this goal!",
    );

    pressByText(getByText, 'Delete Goal');
    const deleteButtons = mockAlert.mock.calls[mockAlert.mock.calls.length - 1][2];
    await act(async () => {
      deleteButtons[1].onPress?.();
    });

    await waitFor(() => expect(mockDeleteGoal).toHaveBeenCalledWith('goal-1'));
    expect(mockPush).toHaveBeenCalledWith('/goals');
  });

  it('returns to the goals list when the target goal is missing', async () => {
    mockGoals = [];
    mockRouteParams = { id: 'missing-goal' };

    const { getAllByText, getByText } = render(<GoalDetailScreen />);

    expect(getAllByText('Goal Not Found').length).toBeGreaterThan(0);
    pressByText(getByText, 'Back to Goals');

    expect(mockPush).toHaveBeenCalledWith('/goals');
  });
});
