import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { deployedRelease, refreshRelease } from '../lib/releaseUpdate';

export default function ReleaseUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const noticeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || Capacitor.isNativePlatform()) return;
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const latest = await deployedRelease();
        if (!disposed) setAvailable(latest !== __APP_RELEASE__);
        if ('serviceWorker' in navigator) await (await navigator.serviceWorker.getRegistration())?.update();
      } catch { /* Offline or deployment in progress: try again on the next resume. */ }
      finally { checking = false; }
    };
    const requested = () => { setAvailable(true); };
    void check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('online', check);
    window.addEventListener('release-refresh-request', requested);
    const interval = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('online', check);
      window.removeEventListener('release-refresh-request', requested);
    };
  }, []);
  // Only watch page layout while the update banner is actually visible.
  // Previously a whole-document MutationObserver ran on every React DOM change
  // even when there was no update, forcing repeated layout measurements.
  useEffect(() => {
    if (!available) return;
    const notice = noticeRef.current;
    if (!notice) return;

    const defaultBottom = notice.style.bottom;
    const defaultTop = notice.style.top;
    let frame: number | null = null;
    let observedGate: HTMLElement | null = null;
    // requestAnimationFrame is not implemented by some test/dom runtimes.
    const supportsFrames =
      typeof window.requestAnimationFrame === 'function' &&
      typeof window.cancelAnimationFrame === 'function';
    const requestFrame = supportsFrames
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) =>
          window.setTimeout(() => callback(performance.now()), 16);
    const cancelFrame = supportsFrames
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);

    const restorePosition = () => {
      if (notice.style.bottom !== defaultBottom) notice.style.bottom = defaultBottom;
      if (notice.style.top !== defaultTop) notice.style.top = defaultTop;
    };

    const sync = () => {
      const gate = document.querySelector<HTMLElement>('[data-google-sign-in-gate]');
      if (gate !== observedGate) {
        if (observedGate) resizeObserver?.unobserve(observedGate);
        observedGate = gate;
        if (gate) resizeObserver?.observe(gate);
      }

      if (!gate) {
        restorePosition();
        return;
      }

      const noticeRect = notice.getBoundingClientRect();
      const gateRect = gate.getBoundingClientRect();
      const overlapsHorizontally =
        noticeRect.left < gateRect.right && noticeRect.right > gateRect.left;
      if (!overlapsHorizontally) {
        restorePosition();
        return;
      }

      // Use visual-viewport coordinates; innerHeight is unreliable on mobile
      // browsers with collapsing address bars and safe-area insets.
      const top = `${Math.max(16, Math.floor(gateRect.top - noticeRect.height - 12))}px`;
      if (notice.style.bottom !== 'auto') notice.style.bottom = 'auto';
      if (notice.style.top !== top) notice.style.top = top;
    };

    // Coalesce DOM and resize events into one layout read per animation frame,
    // avoiding observer/layout feedback during rapid dashboard updates.
    const scheduleSync = () => {
      if (frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        sync();
      });
    };

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleSync);
    resizeObserver?.observe(notice);
    const mutationObserver = new MutationObserver(scheduleSync);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleSync);
    sync();

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleSync);
      if (frame !== null) cancelFrame(frame);
      restorePosition();
    };
  }, [available, message]);
  const refresh = async () => {
    setBusy(true);
    setMessage('');
    try {
      const refreshed = await refreshRelease(__APP_RELEASE__);
      if (!refreshed) setAvailable(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your drafts. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!available) return null;
  return <aside ref={noticeRef} data-release-refresh role="status" aria-live="polite" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }} className="fixed bottom-4 left-4 right-4 z-[79] mx-auto max-w-md rounded-2xl border border-blue-400/50 bg-slate-950 p-4 text-white shadow-xl sm:left-4 sm:right-auto sm:mx-0 sm:max-w-sm">
    <p className="!text-white font-semibold">Edutu has been updated</p>
    {message && <p className="mt-2 !text-white/90 text-sm">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-medium !text-white disabled:opacity-50">{busy ? 'Preparing refresh…' : 'Refresh now'}</button>
  </aside>;
}
