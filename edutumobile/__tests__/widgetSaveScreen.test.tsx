import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import WidgetSaveScreen from '../app/widget-save';
import { saveOpportunityFromWidget } from '../packages/core/src/services/bookmarks';
const mockAuth = { userId: 'user-a' as string | null, isLoaded: true, getToken: jest.fn().mockResolvedValue('session') };
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'opportunity-a' }), useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../components/context/ThemeContext', () => ({ useTheme: () => ({ colors: { background: '#FFF', foreground: '#111', textSecondary: '#555', accent: '#3563E9' } }) }));
jest.mock('../packages/core/src/services/bookmarks', () => ({ saveOpportunityFromWidget: jest.fn() }));
const save = saveOpportunityFromWidget as jest.Mock;
beforeEach(() => { jest.clearAllMocks(); mockAuth.userId = 'user-a'; });
it('only shows saved after the backend confirms', async () => {
  let finish!: () => void;
  save.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  render(<WidgetSaveScreen />);
  expect(screen.getByText('Saving your opportunity')).toBeTruthy();
  expect(screen.queryByText('Opportunity saved')).toBeNull();
  finish();
  await waitFor(() => expect(screen.getByText('Opportunity saved')).toBeTruthy());
});
it('shows a retry when saving is not confirmed', async () => {
  save.mockRejectedValue(new Error('Offline'));
  render(<WidgetSaveScreen />);
  await waitFor(() => expect(screen.getByText('Save not confirmed')).toBeTruthy());
  expect(screen.getByText('Try again')).toBeTruthy();
});
it('does not attempt a bookmark write while signed out', () => {
  mockAuth.userId = null;
  render(<WidgetSaveScreen />);
  expect(screen.getByText('Sign in to save')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
