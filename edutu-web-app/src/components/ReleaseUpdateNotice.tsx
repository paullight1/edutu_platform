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
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 767px)');
    const notice = noticeRef.current;
    const defaultBottom = notice?.style.bottom ?? '';
    const sync = () => {
      const gate = compact.matches ? document.querySelector<HTMLElement>('[data-google-sign-in-gate]') : null;
      const currentNotice = noticeRef.current;
      resizeObserver?.disconnect();
      if (!currentNotice) return;
      if (!gate || !available) {
        currentNotice.style.bottom = defaultBottom;
        return;
      }
      resizeObserver?.observe(gate);
      resizeObserver?.observe(currentNotice);
      // Keep the sign-in invitation at its normal position, and move the
      // release notice above its top edge. This avoids covering the sheet's
      // actions on short mobile screens and keeps the sheet fully usable.
      const gap = 12;
      const offset = Math.max(16, Math.ceil(window.innerHeight - gate.getBoundingClientRect().top + gap));
      currentNotice.style.bottom = `calc(${offset}px + env(safe-area-inset-bottom))`;
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    const mutationObserver = new MutationObserver(sync);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    compact.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    sync();
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (notice) notice.style.bottom = defaultBottom;
      compact.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
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
  return <aside ref={noticeRef} data-release-refresh role="status" aria-live="polite" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }} className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border border-blue-400/50 bg-slate-950 p-4 text-white shadow-xl sm:left-4 sm:right-auto sm:mx-0 sm:max-w-sm">
    <p className="!text-white font-semibold">Top100 has been updated</p>
    {message && <p className="mt-2 !text-white/90 text-sm">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-medium !text-white disabled:opacity-50">{busy ? 'Preparing refresh…' : 'Refresh now'}</button>
  </aside>;
}
