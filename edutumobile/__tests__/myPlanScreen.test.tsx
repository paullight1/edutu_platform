import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import MyPlanScreen from '../app/(app)/my-plan';
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockToken = jest.fn().mockResolvedValue('token');
const mockJourneys = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }), useFocusEffect: (effect: () => void) => { require('react').useEffect(effect, [effect]); } }));
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ userId: 'member', getToken: () => mockToken() }) }));
jest.mock('../components/context/ThemeContext', () => ({ useTheme: () => ({ colors: { error: '#DC2626', warning: '#D97706', success: '#059669', primary: '#EA580C', accentLight: '#FB923C', muted: '#EEEEEE', background: '#FFF', foreground: '#111', textSecondary: '#555', card: '#FFF', border: '#DDD', accent: '#EA580C', mutedForeground: '#555' } }) }));
jest.mock('@edutu/core/src/services/opportunityJourney', () => ({ listOpportunityJourneys: (...args: unknown[]) => mockJourneys(...args) }));

const entry = { journey: { id: 'journey-one', opportunityId: 'one', state: 'preparing', priority: 'primary' }, opportunity: { title: 'Tracked fellowship' }, progress: { percent: 50, completedRequired: 1, totalRequired: 2 }, nextAction: { label: 'Finish your essay' } };
beforeEach(() => { jest.clearAllMocks(); mockJourneys.mockResolvedValue({ isStale: false, data: [entry] }); });
afterEach(async () => {
  cleanup();
  jest.useRealTimers();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
it('opens the editable plan and loads the selected stage without a rollout flag', async () => {
  const screen = render(<MyPlanScreen />);
  await waitFor(() => expect(screen.getByText('Tracked fellowship')).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Continue Tracked fellowship' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/my-plan/[id]', params: { id: 'journey-one' } });
  fireEvent.press(screen.getByRole('tab', { name: 'Shortlist' }));
  await waitFor(() => expect(mockJourneys).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'discover' })));
});
it('retries failed reads without claiming the plan is empty', async () => {
  mockJourneys.mockResolvedValueOnce({ data: null });
  const screen = render(<MyPlanScreen />);
  await waitFor(() => expect(screen.getByText('Unable to load your plan. Please try again.')).toBeTruthy());
  expect(screen.queryByText('No opportunities in this stage')).toBeNull();
  fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(screen.getByText('Tracked fellowship')).toBeTruthy());
});

it('keeps workspace sections available without restarting reads when Clerk callbacks change', async () => {
  const screen = render(<MyPlanScreen />);
  await waitFor(() => expect(screen.getByText('Tracked fellowship')).toBeTruthy());
  screen.rerender(<MyPlanScreen />);
  expect(mockJourneys).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Deadlines' }));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/deadlines', params: { planNav: '1' } });
});
it('ends a stalled read after 15 seconds and lets the user retry', async () => {
  jest.useFakeTimers();
  try {
    mockJourneys.mockImplementationOnce(() => new Promise(() => {}));
    const screen = render(<MyPlanScreen />);
    await act(async () => {});
    await act(async () => { jest.advanceTimersByTime(15000); });
    expect(screen.queryByText('Loading your plan...')).toBeNull();
    expect(screen.getByText('Unable to load your plan. Please try again.')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText('Try again')); });
    expect(screen.getByText('Tracked fellowship')).toBeTruthy();
    screen.unmount();
  } finally { jest.useRealTimers(); }
});
