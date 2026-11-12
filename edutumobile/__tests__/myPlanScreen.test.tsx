import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import MyPlanScreen from '../app/(app)/my-plan';
import PlanStageScreen from '../app/(app)/my-plan/stage/[stage]';
let mockStage = 'pursuing';
let mockUserId = 'member';
jest.mock('../components/opportunity-path/PlanGoalPreview', () => ({ PlanGoalPreview: () => null }));
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockToken = jest.fn().mockResolvedValue('token');
const mockJourneys = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ stage: mockStage }), useRouter: () => ({ push: mockPush, navigate: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }), useFocusEffect: (effect: () => void) => { require('react').useEffect(effect, [effect]); } }));
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ userId: mockUserId, getToken: () => mockToken() }) }));
jest.mock('../components/context/ThemeContext', () => ({ useTheme: () => ({ colors: { error: '#DC2626', warning: '#D97706', success: '#059669', primary: '#EA580C', accentLight: '#FB923C', muted: '#EEEEEE', background: '#FFF', foreground: '#111', textSecondary: '#555', card: '#FFF', border: '#DDD', accent: '#EA580C', mutedForeground: '#555' } }) }));
jest.mock('@edutu/core/src/services/opportunityJourney', () => ({ listOpportunityJourneys: (...args: unknown[]) => mockJourneys(...args) }));

const entry = { journey: { id: 'journey-one', opportunityId: 'one', state: 'preparing', priority: 'primary' }, opportunity: { title: 'Tracked fellowship' }, progress: { percent: 50, completedRequired: 1, totalRequired: 2 }, nextAction: { label: 'Finish your essay' } };
beforeEach(() => { jest.clearAllMocks(); mockStage = 'pursuing'; mockUserId = 'member'; mockJourneys.mockResolvedValue({ isStale: false, data: [entry] }); });
afterEach(async () => {
  cleanup();
  jest.useRealTimers();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
it('opens the next step and each status in its own list', async () => {
  const screen = render(<MyPlanScreen />);
  await waitFor(() => expect(screen.getByText('Tracked fellowship')).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Continue Tracked fellowship' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/my-plan/[id]', params: { id: 'journey-one' } });
  for (const [label, stage] of [['Pursuing', 'pursuing'], ['Shortlist', 'discover'], ['Applied', 'applied'], ['Closed', 'outcome']]) {
    fireEvent.press(screen.getByRole('button', { name: `${label}, 1` }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/my-plan/stage/[stage]', params: { stage } });
  }
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
  expect(mockJourneys).toHaveBeenCalledTimes(4);
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

it('paginates status lists and resets to page one when searching', async () => {
  mockJourneys.mockResolvedValue({ isStale: false, data: Array.from({ length: 7 }, (_, i) => ({
    ...entry, journey: { ...entry.journey, id: `journey-${i}` }, opportunity: { title: `Fellowship ${i}` },
  })) });
  const screen = render(<PlanStageScreen />);
  await waitFor(() => expect(screen.getByText('Fellowship 0')).toBeTruthy());
  expect(screen.queryByText('Fellowship 3')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Page 2 of 3')).toBeTruthy();
  expect(screen.getByText('Fellowship 3')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Search this plan list'), 'Fellowship 6');
  expect(screen.getByText('Fellowship 6')).toBeTruthy();
  expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Continue Fellowship 6' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/my-plan/[id]', params: { id: 'journey-6' } });
});
it('hides the previous account’s plan while another account loads', async () => {
  const screen = render(<MyPlanScreen />);
  await waitFor(() => expect(screen.getByText('Tracked fellowship')).toBeTruthy());
  mockUserId = 'another-member';
  mockJourneys.mockImplementation(() => new Promise(() => {}));
  screen.rerender(<MyPlanScreen />);
  expect(screen.queryByText('Tracked fellowship')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pursuing, 1' })).toBeNull();
});
