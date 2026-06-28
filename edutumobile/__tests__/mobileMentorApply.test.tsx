import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity, View } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockInsert = jest.fn().mockResolvedValue({ error: null });

let mockUserState: { user: any } = {
  user: {
    id: 'mentor-user-1',
    fullName: 'Amina Mentor',
    imageUrl: null,
    primaryEmailAddress: { emailAddress: 'amina.mentor@example.com' },
  },
};

const mockSupabase = {
  from: jest.fn(() => ({
    insert: (...args: unknown[]) => mockInsert(...args),
  })),
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => mockUserState,
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#146ef5',
      primary: '#146ef5',
      textSecondary: '#64748B',
    },
  }),
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
  const icon = (name: string) => () => <Text>{name}</Text>;
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') return icon(prop);
        return undefined;
      },
    },
  );
});

const MentorApplyScreen = require('../app/(app)/mentor-apply').default;

function findNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }

  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }

  return current;
}

async function pressNearestTouchTarget(node: any) {
  const current = findNearestTouchTarget(node);
  await act(async () => {
    current.props.onPress?.();
  });
}

describe('mobile mentor apply flow', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockInsert.mockClear();
    mockSupabase.from.mockClear();
    mockSupabase.from.mockImplementation(() => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    }));
    mockUserState = {
      user: {
        id: 'mentor-user-1',
        fullName: 'Amina Mentor',
        imageUrl: null,
        primaryEmailAddress: { emailAddress: 'amina.mentor@example.com' },
      },
    };
  });

  it('keeps the continue and review buttons disabled until required fields are set', async () => {
    const { getByText, getByPlaceholderText } = render(<MentorApplyScreen />);

    expect(getByText('Get Started')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Get Started'));
    await waitFor(() => expect(getByText('What motivates you?')).toBeTruthy());

    const continueButton = findNearestTouchTarget(getByText('Continue'));
    expect(continueButton?.props.disabled).toBe(true);

    await pressNearestTouchTarget(getByText('I enjoy mentoring and sharing knowledge'));
    await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));

    await pressNearestTouchTarget(getByText('Continue'));
    await waitFor(() => expect(getByText('Tell us about yourself')).toBeTruthy());

    const reviewButton = findNearestTouchTarget(getByText('Review Application'));
    expect(reviewButton?.props.disabled).toBe(true);

    fireEvent.changeText(getByPlaceholderText('How should learners know you?'), 'Amina Mentor');
    fireEvent.changeText(getByPlaceholderText('Share your background, achievements...'), 'Mentor bio');
    fireEvent.changeText(getByPlaceholderText('e.g., 5 years in software engineering'), '5 years');

    await waitFor(() => expect(findNearestTouchTarget(getByText('Review Application')).props.disabled).toBe(false));
  });

  it('walks through the review step and reflects the selected application details', async () => {
    const { getByText, getByPlaceholderText } = render(<MentorApplyScreen />);

    expect(getByText('Get Started')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Get Started'));
    await waitFor(() => expect(getByText('What motivates you?')).toBeTruthy());
    await pressNearestTouchTarget(getByText('I want to give back to the community'));
    await pressNearestTouchTarget(getByText('Continue'));

    await waitFor(() => expect(getByText('Tell us about yourself')).toBeTruthy());
    await pressNearestTouchTarget(getByText('Course'));
    fireEvent.changeText(getByPlaceholderText('How should learners know you?'), 'Amina Mentor');
    fireEvent.changeText(getByPlaceholderText('Share your background, achievements...'), 'Mentor bio');
    fireEvent.changeText(getByPlaceholderText('e.g., 5 years in software engineering'), '5 years');
    fireEvent.changeText(getByPlaceholderText('linkedin.com/in/...'), 'https://linkedin.com/in/amina');
    fireEvent.changeText(getByPlaceholderText('your-portfolio.com'), 'https://portfolio.example.com');

    await pressNearestTouchTarget(getByText('Review Application'));

    await waitFor(() => expect(getByText('Review your application')).toBeTruthy());
    expect(getByText('Amina Mentor')).toBeTruthy();
    expect(getByText('I want to give back to the community')).toBeTruthy();
    expect(getByText('Course')).toBeTruthy();
    expect(getByText('5 years')).toBeTruthy();
    expect(getByText('Mentor bio')).toBeTruthy();
    expect(getByText('https://linkedin.com/in/amina')).toBeTruthy();
    expect(getByText('https://portfolio.example.com')).toBeTruthy();
  });

  it('submits the mentor application and returns to profile from the success screen', async () => {
    const { getByText, getByPlaceholderText } = render(<MentorApplyScreen />);

    expect(getByText('Get Started')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Get Started'));
    await waitFor(() => expect(getByText('What motivates you?')).toBeTruthy());
    await pressNearestTouchTarget(getByText('I enjoy mentoring and sharing knowledge'));
    await pressNearestTouchTarget(getByText('Continue'));

    await waitFor(() => expect(getByText('Tell us about yourself')).toBeTruthy());
    await pressNearestTouchTarget(getByText('Templates'));
    fireEvent.changeText(getByPlaceholderText('How should learners know you?'), 'Amina Mentor');
    fireEvent.changeText(getByPlaceholderText('Share your background, achievements...'), 'Mentor bio');
    fireEvent.changeText(getByPlaceholderText('e.g., 5 years in software engineering'), '5 years');
    fireEvent.changeText(getByPlaceholderText('linkedin.com/in/...'), 'https://linkedin.com/in/amina');
    fireEvent.changeText(getByPlaceholderText('your-portfolio.com'), 'https://portfolio.example.com');

    await pressNearestTouchTarget(getByText('Review Application'));
    await waitFor(() => expect(getByText('Review your application')).toBeTruthy());

    await pressNearestTouchTarget(getByText('Submit Application'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockSupabase.from).toHaveBeenCalledWith('creator_applications');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'mentor-user-1',
      displayName: 'Amina Mentor',
      bio: 'Mentor bio',
      contentType: 'template',
      experience: '5 years',
      sampleContentUrl: 'https://portfolio.example.com',
      status: 'pending',
    }));

    await waitFor(() => expect(getByText('Application Sent!')).toBeTruthy());
    await pressNearestTouchTarget(getByText('Back to Profile'));
    expect(mockReplace).toHaveBeenCalledWith('/profile');
  });

  it('prevents a duplicate submit while the application is still in flight', async () => {
    const deferred = createDeferred<{ error: null }>();
    mockInsert.mockReturnValueOnce(deferred.promise);

    const { getByText, getByPlaceholderText } = render(<MentorApplyScreen />);

    expect(getByText('Get Started')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Get Started'));
    await waitFor(() => expect(getByText('What motivates you?')).toBeTruthy());
    await pressNearestTouchTarget(getByText('I enjoy mentoring and sharing knowledge'));
    await pressNearestTouchTarget(getByText('Continue'));

    await waitFor(() => expect(getByText('Tell us about yourself')).toBeTruthy());
    await pressNearestTouchTarget(getByText('Course'));
    fireEvent.changeText(getByPlaceholderText('How should learners know you?'), 'Amina Mentor');
    fireEvent.changeText(getByPlaceholderText('Share your background, achievements...'), 'Mentor bio');
    fireEvent.changeText(getByPlaceholderText('e.g., 5 years in software engineering'), '5 years');

    await pressNearestTouchTarget(getByText('Review Application'));
    await waitFor(() => expect(getByText('Review your application')).toBeTruthy());

    await pressNearestTouchTarget(getByText('Submit Application'));
    expect(getByText('Submitting...')).toBeTruthy();
    expect(mockInsert).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Submitting...'));
    expect(mockInsert).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ error: null });
    });

    await waitFor(() => expect(getByText('Application Sent!')).toBeTruthy());
  });
});
