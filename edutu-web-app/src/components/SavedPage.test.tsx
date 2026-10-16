import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SavedPage from './SavedPage';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  user: { id: 'learner-1' },
  getBookmarks: vi.fn(),
  removeBookmark: vi.fn(),
}));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock('../services/bookmarks', () => ({
  getBookmarks: mocks.getBookmarks,
  removeBookmark: mocks.removeBookmark,
}));
vi.mock('./WebPushPrompt', () => ({ default: () => null }));

const savedOpportunity = {
  id: 'bookmark-1',
  user_id: 'learner-1',
  opportunity_id: 'opp-1',
  opportunity_title: 'Global Research Fellowship',
  opportunity_category: 'Fellowship',
  opportunity_deadline: '2026-11-15T00:00:00.000Z',
  opportunity_location: 'Remote',
  match_percentage: 90,
  created_at: '2026-10-01T00:00:00.000Z',
};

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

function renderSavedPage() {
  return render(
    <MemoryRouter initialEntries={['/app/saved']}>
      <CurrentPath />
      <Routes>
        <Route path="/app/saved" element={<SavedPage />} />
        <Route path="/opportunity/:id" element={<p>Opportunity detail</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SavedPage', () => {
  beforeEach(() => {
    mocks.getToken.mockReset().mockResolvedValue('clerk-token');
    mocks.getBookmarks.mockReset().mockResolvedValue([savedOpportunity]);
    mocks.removeBookmark.mockReset().mockResolvedValue(true);
    mocks.user.id = 'learner-1';
  });

  it('loads saved opportunities with the signed-in account and opens the selected opportunity', async () => {
    renderSavedPage();

    expect(await screen.findByRole('heading', { name: 'Global Research Fellowship' })).toBeInTheDocument();
    expect(mocks.getBookmarks).toHaveBeenCalledWith('learner-1', 'clerk-token');
    fireEvent.click(screen.getByRole('heading', { name: 'Global Research Fellowship' }).closest('button')!);

    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/opportunity/opp-1'));
    expect(screen.getByText('Opportunity detail')).toBeInTheDocument();
  });

  it('removes a saved opportunity from the list and sends the authenticated request', async () => {
    renderSavedPage();
    await screen.findByRole('heading', { name: 'Global Research Fellowship' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Global Research Fellowship from saved opportunities' }));

    await waitFor(() => expect(mocks.removeBookmark).toHaveBeenCalledWith(
      'learner-1',
      'opp-1',
      'clerk-token',
    ));
    expect(await screen.findByText('Removed “Global Research Fellowship” from your saved opportunities.'))
      .toHaveAttribute('role', 'status');
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument();
  });

  it('restores the bookmark and announces a recoverable error if removal fails', async () => {
    mocks.removeBookmark.mockRejectedValueOnce(new Error('Temporary API failure'));
    renderSavedPage();
    await screen.findByRole('heading', { name: 'Global Research Fellowship' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Global Research Fellowship from saved opportunities' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t remove “Global Research Fellowship” from your saved opportunities. Please try again.',
    );
    expect(screen.getByRole('heading', { name: 'Global Research Fellowship' })).toBeInTheDocument();
  });
});
