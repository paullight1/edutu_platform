import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SavedSearch } from '@edutu/core/src/services/savedSearches';

const mockPush = jest.fn();
// Stable identity: the screen's load effect keys on getToken, and a fresh mock
// per render would re-fetch (and undo) every optimistic list mutation.
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockFetchSavedSearches = jest.fn();
const mockCreateSavedSearch = jest.fn();
const mockUpdateSavedSearch = jest.fn();
const mockDeleteSavedSearch = jest.fn();
const mockFetchSavedSearchMatches = jest.fn();
let mockPushEnabled = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      textSecondary: '#64748B',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#2563EB',
    },
    isDark: false,
    reducedMotion: false,
  }),
}));

jest.mock('../lib/notifications', () => ({
  notificationService: {
    loadSettings: jest.fn().mockImplementation(async () => ({ pushEnabled: mockPushEnabled })),
  },
}));

jest.mock('@edutu/core/src/services/savedSearches', () => ({
  fetchSavedSearches: (...args: unknown[]) => mockFetchSavedSearches(...args),
  createSavedSearch: (...args: unknown[]) => mockCreateSavedSearch(...args),
  updateSavedSearch: (...args: unknown[]) => mockUpdateSavedSearch(...args),
  deleteSavedSearch: (...args: unknown[]) => mockDeleteSavedSearch(...args),
  fetchSavedSearchMatches: (...args: unknown[]) => mockFetchSavedSearchMatches(...args),
}));

// Required (not imported) so the jest.mock factories above are registered
// before the screen's module graph is evaluated — the house idiom.
const SavedSearchesScreen = require('../app/(app)/saved-searches')
  .default as React.ComponentType;
const { deriveAlertName } =
  require('../components/savedSearches/AlertComposer') as typeof import('../components/savedSearches/AlertComposer');
const { relativeLabel } =
  require('../components/savedSearches/SavedSearchCard') as typeof import('../components/savedSearches/SavedSearchCard');

function makeSearch(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user_1',
    name: '“fully funded” · Scholarships',
    query: 'fully funded',
    category: 'scholarships',
    fundingType: 'full',
    targetRegion: 'Africa',
    remoteOnly: null,
    notifyEnabled: true,
    matchCount: 3,
    lastMatchedAt: null,
    lastNotifiedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue('token');
  mockPushEnabled = true;
  mockFetchSavedSearches.mockResolvedValue([]);
  mockUpdateSavedSearch.mockResolvedValue(makeSearch());
  mockDeleteSavedSearch.mockResolvedValue(true);
  mockFetchSavedSearchMatches.mockResolvedValue({ search: makeSearch(), matches: [] });
});

describe('deriveAlertName', () => {
  it('mirrors the Discover "Save this search" label', () => {
    expect(deriveAlertName('fully funded', 'Scholarships')).toBe('“fully funded” · Scholarships');
    expect(deriveAlertName('', 'Grants')).toBe('Grants');
    expect(deriveAlertName('remote', null)).toBe('“remote”');
  });
});

describe('relativeLabel', () => {
  const t = ((key: string, opts?: { n?: number }) =>
    opts?.n === undefined ? key : `${key}:${opts.n}`) as never;

  it('returns null when the alert has never matched', () => {
    expect(relativeLabel(null, t)).toBeNull();
  });

  it('buckets into hours and days', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 50 * 3_600_000).toISOString();
    expect(relativeLabel(threeHoursAgo, t)).toBe('alerts.time.hours:3');
    expect(relativeLabel(twoDaysAgo, t)).toBe('alerts.time.days:2');
  });
});

describe('Saved searches screen — empty state', () => {
  it('lets the user create an alert without leaving the screen', async () => {
    const created = makeSearch({ id: '22222222-2222-4222-8222-222222222222' });
    mockCreateSavedSearch.mockResolvedValue(created);

    const screen = render(<SavedSearchesScreen />);
    await waitFor(() => expect(screen.getByTestId('alert-composer')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('alert-composer-query'), 'fully funded');
    fireEvent.press(screen.getByTestId('alert-composer-submit'));

    await waitFor(() => expect(mockCreateSavedSearch).toHaveBeenCalledTimes(1));
    expect(mockCreateSavedSearch.mock.calls[0][0]).toMatchObject({
      name: '“fully funded”',
      query: 'fully funded',
      notifyEnabled: true,
    });
    await waitFor(() => expect(screen.getByTestId(`alert-card-${created.id}`)).toBeTruthy());
  });

  it('warns when push is off, because an alert can only arrive as a push', async () => {
    mockPushEnabled = false;
    const screen = render(<SavedSearchesScreen />);
    await waitFor(() =>
      expect(screen.getByText(/Push notifications are off/i)).toBeTruthy(),
    );
  });
});

describe('Saved searches screen — populated state', () => {
  it('previews live matches through the saved-search endpoint, not a lossy Discover query', async () => {
    const search = makeSearch();
    mockFetchSavedSearches.mockResolvedValue([search]);
    mockFetchSavedSearchMatches.mockResolvedValue({
      search,
      matches: [
        {
          id: 'opp-1',
          title: 'Chevening Scholarship',
          summary: null,
          organization: 'UK Government',
          category: 'scholarships',
          canonicalCategory: 'scholarships',
          deadline: null,
          imageUrl: null,
          createdAt: null,
        },
      ],
    });

    const screen = render(<SavedSearchesScreen />);
    await waitFor(() => expect(screen.getByTestId(`alert-card-${search.id}`)).toBeTruthy());

    fireEvent.press(screen.getByTestId(`alert-expand-${search.id}`));

    await waitFor(() => expect(mockFetchSavedSearchMatches).toHaveBeenCalledTimes(1));
    expect(mockFetchSavedSearchMatches.mock.calls[0][0]).toBe(search.id);
    await waitFor(() => expect(screen.getByText('Chevening Scholarship')).toBeTruthy());

    // The row must not silently re-run a broader q/category search on Discover.
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/opportunities' }),
    );
  });

  it('reverts and tells the user when muting fails', async () => {
    const search = makeSearch();
    mockFetchSavedSearches.mockResolvedValue([search]);
    mockUpdateSavedSearch.mockResolvedValue(null);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const screen = render(<SavedSearchesScreen />);
    await waitFor(() => expect(screen.getByTestId(`alert-toggle-${search.id}`)).toBeTruthy());

    fireEvent.press(screen.getByTestId(`alert-toggle-${search.id}`));

    await waitFor(() => expect(mockUpdateSavedSearch).toHaveBeenCalledWith(
      search.id,
      { notifyEnabled: false },
      expect.anything(),
    ));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(String(alertSpy.mock.calls[0][1])).toMatch(/couldn't save/i);
    alertSpy.mockRestore();
  });

  it('edits an alert in place and preserves criteria the form does not expose', async () => {
    const search = makeSearch();
    mockFetchSavedSearches.mockResolvedValue([search]);
    mockUpdateSavedSearch.mockResolvedValue({ ...search, name: 'Renamed' });

    const screen = render(<SavedSearchesScreen />);
    await waitFor(() => expect(screen.getByTestId(`alert-edit-${search.id}`)).toBeTruthy());

    fireEvent.press(screen.getByTestId(`alert-edit-${search.id}`));
    fireEvent.changeText(screen.getByTestId('alert-composer-name'), 'Renamed');
    fireEvent.press(screen.getByTestId('alert-composer-submit'));

    await waitFor(() => expect(mockUpdateSavedSearch).toHaveBeenCalledTimes(1));
    expect(mockUpdateSavedSearch.mock.calls[0][0]).toBe(search.id);
    expect(mockUpdateSavedSearch.mock.calls[0][1]).toMatchObject({
      name: 'Renamed',
      query: 'fully funded',
      category: 'scholarships',
      fundingType: 'full',
      targetRegion: 'Africa',
    });
    await waitFor(() => expect(screen.getByText('Renamed')).toBeTruthy());
  });

  it('confirms before deleting and removes the row', async () => {
    const search = makeSearch();
    mockFetchSavedSearches.mockResolvedValue([search]);
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _body, buttons) => {
        const destructive = (buttons ?? []).find((button) => button.style === 'destructive');
        void destructive?.onPress?.();
      });

    const screen = render(<SavedSearchesScreen />);
    await waitFor(() => expect(screen.getByTestId(`alert-delete-${search.id}`)).toBeTruthy());

    fireEvent.press(screen.getByTestId(`alert-delete-${search.id}`));

    await waitFor(() => expect(mockDeleteSavedSearch).toHaveBeenCalledWith(
      search.id,
      expect.anything(),
    ));
    await waitFor(() => expect(screen.queryByTestId(`alert-card-${search.id}`)).toBeNull());
    alertSpy.mockRestore();
  });

  it('sends the gear to notification settings', async () => {
    mockFetchSavedSearches.mockResolvedValue([makeSearch()]);
    const screen = render(<SavedSearchesScreen />);
    await waitFor(() => expect(screen.getByTestId('alerts-settings')).toBeTruthy());

    fireEvent.press(screen.getByTestId('alerts-settings'));
    expect(mockPush).toHaveBeenCalledWith('/profile/settings');
  });
});
