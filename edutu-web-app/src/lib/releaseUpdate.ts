import { refreshBlocked, releaseEditRevision, saveReleaseDrafts } from './releaseSafety';

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    operation.then(
      value => { clearTimeout(timeout); resolve(value); },
      error => { clearTimeout(timeout); reject(error); },
    );
  });
}

export async function deployedRelease(): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Could not check the latest release. Please try again.');
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null || !('version' in data) || typeof data.version !== 'string' || !data.version.trim()) {
      throw new Error('The update is not ready yet. Please try again.');
    }
    return data.version;
  } finally { clearTimeout(timeout); }
}

export function waitForWorker(worker: ServiceWorker, target: 'installed' | 'activated') {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error); else resolve();
    };
    const changed = () => {
      if (worker.state === 'redundant') finish(new Error('Update could not be installed. Please try again.'));
      else if (worker.state === target || (target === 'installed' && (worker.state === 'activating' || worker.state === 'activated'))) finish();
    };
    const timeout = window.setTimeout(() => finish(new Error('Update is still preparing. Please try again.')), 15000);
    worker.addEventListener('statechange', changed);
    changed();
  });
}

const finishWorkMessage = 'Finish saving your form or upload, then try again. You can also leave the editor after saving.';
export async function refreshRelease(runningRelease: string, reload = () => window.location.reload()) {
  if (!navigator.onLine) throw new Error('Connect to the internet before refreshing.');
  const revision = releaseEditRevision();
  const assertSafe = () => {
    if (refreshBlocked() || revision !== releaseEditRevision()) throw new Error(finishWorkMessage);
  };
  assertSafe();
  await withTimeout(saveReleaseDrafts(), 15000, 'Saving your drafts is taking longer than expected. Please try again.');
  assertSafe();
  // A rollback or incomplete deployment must not trigger a stale-shell reload loop.
  if (await deployedRelease() === runningRelease) return false;
  assertSafe();
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration) {
    await withTimeout(registration.update(), 10000, 'The app update is taking longer than expected. Please try again.');
    if (registration.installing) await waitForWorker(registration.installing, 'installed');
    assertSafe();
    const waiting = registration.waiting;
    if (waiting) {
      const activated = waitForWorker(waiting, 'activated');
      waiting.postMessage({ type: 'SKIP_WAITING' });
      await activated;
    }
  }
  assertSafe();
  reload();
  return true;
}
