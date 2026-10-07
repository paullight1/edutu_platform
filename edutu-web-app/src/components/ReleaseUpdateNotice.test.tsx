import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ReleaseUpdateNotice from './ReleaseUpdateNotice';
import { registerReleaseDraftSaver } from '../lib/releaseSafety';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('../lib/releaseSafety', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/releaseSafety')>(),
  refreshBlocked: () => true,
}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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
