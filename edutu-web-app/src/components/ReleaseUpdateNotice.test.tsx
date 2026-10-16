import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ReleaseUpdateNotice from './ReleaseUpdateNotice';
import { registerReleaseDraftSaver } from '../lib/releaseSafety';

function renderNotice(path = '/dashboard', userId: string | null = 'learner-1') {
  return render(<MemoryRouter initialEntries={[path]}><ReleaseUpdateNotice userId={userId} /></MemoryRouter>);
}

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('../lib/releaseSafety', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/releaseSafety')>(),
  refreshBlocked: () => true,
}));
afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('an old session sees a new deployment without reloading or interrupting work', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-b' }) });
  vi.stubGlobal('fetch', fetch);
  const save = vi.fn().mockResolvedValue(undefined);
  const unregister = registerReleaseDraftSaver(save);
  renderNotice();
  await screen.findByText('Top100 has been updated');
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/version.json?'), expect.objectContaining({ cache: 'no-store' }));
  fireEvent.click(screen.getByText('Refresh now'));
  await screen.findByText(/Finish saving your form or upload/);
  expect(save).not.toHaveBeenCalled();
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  unregister();
});
it('does not show a notice for the running release', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-a' }) }));
  renderNotice();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByText('Top100 has been updated')).toBeNull();
});

it('lets users dismiss an update until a different release is deployed', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-b' }) }));
  const first = renderNotice();
  await screen.findByText('Top100 has been updated');
  expect(screen.getByRole('status')).toHaveClass('bg-white', 'text-slate-900');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
  expect(screen.queryByText('Top100 has been updated')).toBeNull();
  first.unmount();

  renderNotice();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Top100 has been updated')).toBeNull();

  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ version: 'release-c' }) } as Response);
  window.dispatchEvent(new Event('release-refresh-request'));
  await screen.findByText('Top100 has been updated');
});

it('keeps dismissal scoped to the signed-in learner', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-b' }) }));

  const first = renderNotice('/dashboard', 'learner-1');
  await screen.findByText('Top100 has been updated');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
  first.unmount();

  renderNotice('/dashboard', 'learner-2');
  await screen.findByText('Top100 has been updated');
});

it('keeps the release notice inside the light dashboard flow', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-b' }) }));
  renderNotice();
  const notice = await screen.findByText('Top100 has been updated');
  const noticeCard = notice.closest<HTMLElement>('[data-release-refresh]')!;
  expect(noticeCard).toHaveClass('bg-white', 'text-slate-900', 'mb-5');
  expect(noticeCard.className).not.toContain('fixed');
  expect(noticeCard.className).not.toContain('dark:');
  expect(screen.getByRole('button', { name: 'Refresh now' })).toHaveClass('bg-blue-700', 'text-white');
});

it.each([
  '/app/wallet',
  '/app/opportunities',
  '/app/profile',
  '/app/deadlines',
  '/app/settings',
  '/dashboard/developer',
  '/mentor/dashboard',
  '/events',
  '/whats-new',
  '/auth',
  '/',
])('does not check or show updates on %s', async path => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-b' }) });
  vi.stubGlobal('fetch', fetch);

  renderNotice(path);
  await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  expect(screen.queryByText('Top100 has been updated')).toBeNull();
});

it('does not check or show updates without a signed-in user', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);

  renderNotice('/dashboard', null);
  await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  expect(screen.queryByText('Top100 has been updated')).toBeNull();
});
