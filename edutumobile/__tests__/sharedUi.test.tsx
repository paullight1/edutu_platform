import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const icon = (name: string) => () => <Text>{name}</Text>;
  return {
    AlertCircle: icon('AlertCircle'),
    Bookmark: icon('Bookmark'),
    Compass: icon('Compass'),
    FileText: icon('FileText'),
    Inbox: icon('Inbox'),
    SearchX: icon('SearchX'),
    Sparkles: icon('Sparkles'),
    Target: icon('Target'),
    Wifi: icon('Wifi'),
    WifiOff: icon('WifiOff'),
    // EmptyState imports these two as well; a missing entry here renders as
    // `undefined` and fails with "Element type is invalid" rather than
    // anything meaningful, so keep this list in sync with the component.
    Bell: icon('Bell'),
    ArrowRight: icon('ArrowRight'),
  };
});

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const { AccessibleView, AccessibleTouchable } = require('../components/ui/AccessibleView');
const { EmptyState } = require('../components/ui/EmptyState');
const { ScreenWrapper } = require('../components/ui/ScreenWrapper');
const { ThemeProvider, useTheme } = require('../components/context/ThemeContext');

function ThemeConsumer() {
  const { theme, isDark, colors, setTheme, setMode } = useTheme();

  return (
    <View>
      <Text>{theme}</Text>
      <Text>{isDark ? 'dark' : 'light'}</Text>
      <Text>{colors.background}</Text>
      <Pressable onPress={() => setTheme('ocean')}>
        <Text>Switch theme</Text>
      </Pressable>
      <Pressable onPress={() => setMode('light')}>
        <Text>Switch mode</Text>
      </Pressable>
    </View>
  );
}

describe('shared UI primitives and theming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies accessibility labels, roles, and state in AccessibleView', () => {
    const { getByLabelText } = render(
      <AccessibleView
        label="Profile section"
        hint="Profile summary"
        isHeader
        isSelected
        disabled
      >
        <Text>Content</Text>
      </AccessibleView>,
    );

    const node = getByLabelText('Profile section');
    expect(node.props.accessibilityRole).toBe('header');
    expect(node.props.accessibilityHint).toBe('Profile summary');
    expect(node.props.accessibilityState).toEqual({ selected: true, disabled: true });
    expect(node.props.accessible).toBe(true);
  });

  it('wraps touch targets as accessible buttons', () => {
    const { getByLabelText } = render(
      <AccessibleTouchable label="Save changes" hint="Commits the current form">
        <Text>Tap target</Text>
      </AccessibleTouchable>,
    );

    const node = getByLabelText('Save changes');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityHint).toBe('Commits the current form');
    expect(node.props.accessible).toBe(true);
  });

  it('renders the expected empty-state copy and action', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <EmptyState variant="saved" onAction={onAction} />,
    );

    expect(getByText('No saved opportunities')).toBeTruthy();
    fireEvent.press(getByText('Browse Opportunities'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows wrapper error state and lets the user retry', () => {
    const onRetry = jest.fn();
    const { getByText } = render(
      <ScreenWrapper isLoading={false} isEmpty={false} error={new Error('Boom')} onRetry={onRetry}>
        <Text>Child content</Text>
      </ScreenWrapper>,
    );

    expect(getByText('Boom')).toBeTruthy();
    fireEvent.press(getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('withLoadingStates renders a real error state with a working retry', () => {
    // Regression guard: this HOC used to wrap the (healthy) children in an
    // ErrorBoundary on `error` — boundaries only trigger when a child throws,
    // so the error was never shown and onRetry was stripped and dropped.
    const { withLoadingStates } = require('../components/ui/withLoadingStates');
    const Wrapped = withLoadingStates(({ label }: { label: string }) => <Text>{label}</Text>);
    const onRetry = jest.fn();
    const { getByText, queryByText, rerender } = render(
      <Wrapped label="Child content" isLoading={false} isEmpty={false} error={new Error('Boom')} onRetry={onRetry} />,
    );

    expect(getByText('Boom')).toBeTruthy();
    expect(queryByText('Child content')).toBeNull();
    fireEvent.press(getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <Wrapped label="Child content" isLoading={false} isEmpty={false} error={null} onRetry={onRetry} />,
    );
    expect(getByText('Child content')).toBeTruthy();
  });

  it('loads theme settings from storage and persists updates', async () => {
    mockedStorage.getItem.mockImplementation(async (key) => {
      switch (key) {
        case 'edutu_theme_package':
          return 'royal';
        case 'edutu_theme_mode':
          return 'light';
        case 'edutu_font_size':
          return 'large';
        case 'edutu_reduced_motion':
          return 'true';
        case 'edutu_high_contrast':
          return 'false';
        default:
          return null;
      }
    });

    const { getByText } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => expect(getByText('royal')).toBeTruthy());
    expect(getByText('light')).toBeTruthy();
    expect(getByText('#F5F3FF')).toBeTruthy();

    fireEvent.press(getByText('Switch theme'));
    fireEvent.press(getByText('Switch mode'));

    await waitFor(() =>
      expect(mockedStorage.setItem).toHaveBeenCalledWith('edutu_theme_package', 'ocean'),
    );
    expect(mockedStorage.setItem).toHaveBeenCalledWith('edutu_theme_mode', 'light');
  });
});
