import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ReleaseUpdateNotice from './ReleaseUpdateNotice';
import { registerReleaseDraftSaver } from '../lib/releaseSafety';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('../lib/releaseSafety', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/releaseSafety')>(),
  refreshBlocked: () => true,
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('an old session sees a new deployment without reloading or interrupting work', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-b' }) });
  vi.stubGlobal('fetch', fetch);
  const save = vi.fn().mockResolvedValue(undefined);
  const unregister = registerReleaseDraftSaver(save);
  render(<ReleaseUpdateNotice />);
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
  render(<ReleaseUpdateNotice />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByText('Top100 has been updated')).toBeNull();
});

it('lifts the sign-in invitation above the release notice on narrow screens', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__APP_RELEASE__', 'release-a');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'release-b' }) }));
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(max-width: 767px)', media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  const gate = document.createElement('aside');
  gate.dataset.googleSignInGate = '';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('[data-release-refresh]')
      ? new DOMRect(16, 0, 398, 140)
      : new DOMRect(20, 560, 390, 352);
  });
  document.body.append(gate);

  try {
    const view = render(<ReleaseUpdateNotice />);
    const notice = await screen.findByText('Top100 has been updated');
    const noticeCard = notice.closest<HTMLElement>('[data-release-refresh]')!;
    await waitFor(() => expect(gate.style.bottom).toBe('calc(168px + env(safe-area-inset-bottom))'));
    expect(noticeCard).toHaveClass('bottom-4');
    expect(noticeCard).toHaveStyle({ bottom: 'calc(16px + env(safe-area-inset-bottom))' });
    expect(notice).toHaveStyle({ color: '#fff' });
    const viewportHeight = 932;
    const noticeTop = viewportHeight - (140 + 16);
    const gateBottom = viewportHeight - 168;
    expect(noticeTop - gateBottom).toBe(12);
    view.unmount();
    expect(gate.style.bottom).toBe('');
  } finally {
    gate.remove();
  }
});
