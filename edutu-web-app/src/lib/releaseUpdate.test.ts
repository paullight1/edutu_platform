import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deployedRelease, refreshRelease, waitForWorker } from './releaseUpdate';
const safety = vi.hoisted(() => ({ blocked: false, revision: 0, save: vi.fn() }));
vi.mock('./releaseSafety', () => ({
  refreshBlocked: () => safety.blocked,
  releaseEditRevision: () => safety.revision,
  saveReleaseDrafts: () => safety.save(),
}));
beforeEach(() => {
  safety.blocked = false;
  safety.revision = 0;
  safety.save.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'B' }) }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('reloads an old session only after its drafts are saved', async () => {
  const reload = vi.fn();
  await expect(refreshRelease('A', reload)).resolves.toBe(true);
  expect(safety.save).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});
it('does not reload when a draft fails to save', async () => {
  safety.save.mockRejectedValue(new Error('Draft save failed'));
  const reload = vi.fn();
  await expect(refreshRelease('A', reload)).rejects.toThrow('Draft save failed');
  expect(reload).not.toHaveBeenCalled();
});
it('protects managed draft edits typed during an asynchronous save', async () => {
  safety.save.mockImplementation(async () => { safety.revision++; });
  const reload = vi.fn();
  await expect(refreshRelease('A', reload)).rejects.toThrow('Finish saving');
  expect(reload).not.toHaveBeenCalled();
});
it('blocks in-flight work and offline refresh', async () => {
  const reload = vi.fn();
  safety.blocked = true;
  await expect(refreshRelease('A', reload)).rejects.toThrow('Finish saving');
  safety.blocked = false;
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false);
  await expect(refreshRelease('A', reload)).rejects.toThrow('Connect to the internet');
  expect(reload).not.toHaveBeenCalled();
});
it('does not reload when deployment rolls back to the running version', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ version: 'A' }) } as Response);
  const reload = vi.fn();
  await expect(refreshRelease('A', reload)).resolves.toBe(false);
  expect(reload).not.toHaveBeenCalled();
});
it('rejects missing or invalid release metadata', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
  await expect(deployedRelease()).rejects.toThrow('Could not check');
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ version: '' }) } as Response);
  await expect(deployedRelease()).rejects.toThrow('not ready');
});
it('waits for worker activation and rejects failed installs', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'installed' });
  const activation = waitForWorker(worker as ServiceWorker, 'activated');
  worker.state = 'activated';
  worker.dispatchEvent(new Event('statechange'));
  await expect(activation).resolves.toBeUndefined();
  worker.state = 'redundant';
  await expect(waitForWorker(worker as ServiceWorker, 'installed')).rejects.toThrow('could not be installed');
});
it('times out stalled worker activation', async () => {
  vi.useFakeTimers();
  const worker = Object.assign(new EventTarget(), { state: 'installed' });
  const activation = waitForWorker(worker as ServiceWorker, 'activated');
  const result = expect(activation).rejects.toThrow('still preparing');
  await vi.advanceTimersByTimeAsync(15000);
  await result;
});
it('activates a waiting worker before reloading', async () => {
  const worker = Object.assign(new EventTarget(), {
    state: 'installed',
    postMessage: vi.fn(() => { worker.state = 'activated'; worker.dispatchEvent(new Event('statechange')); }),
  });
  const update = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: { getRegistration: async () => ({ update, waiting: worker }) } });
  const reload = vi.fn();
  await refreshRelease('A', reload);
  expect(update).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(reload).toHaveBeenCalledOnce();
});
