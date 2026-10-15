import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { X } from 'lucide-react';
import { deployedRelease, refreshRelease } from '../lib/releaseUpdate';

const DISMISSED_RELEASE_KEY = 'edutu.dismissed-release-update';

function wasDismissed(release: string) {
  try { return window.localStorage.getItem(DISMISSED_RELEASE_KEY) === release; }
  catch { return false; }
}

export default function ReleaseUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [release, setRelease] = useState('');
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
        if (!disposed) {
          setRelease(latest);
          setAvailable(latest !== __APP_RELEASE__ && !wasDismissed(latest));
        }
        if ('serviceWorker' in navigator) await (await navigator.serviceWorker.getRegistration())?.update();
      } catch { /* Offline or deployment in progress: try again on the next resume. */ }
      finally { checking = false; }
    };
    const requested = () => {
      void deployedRelease().then(latest => {
        if (disposed) return;
        setRelease(latest);
        setAvailable(latest !== __APP_RELEASE__ && !wasDismissed(latest));
      }).catch(() => {});
    };
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
    const notice = noticeRef.current;
    const defaultBottom = notice?.style.bottom ?? '';
    const defaultTop = notice?.style.top ?? '';
    const sync = () => {
      const gate = document.querySelector<HTMLElement>('[data-google-sign-in-gate]');
      const currentNotice = noticeRef.current;
      resizeObserver?.disconnect();
      if (!currentNotice) return;
      if (!gate || !available) {
        currentNotice.style.bottom = defaultBottom;
        currentNotice.style.top = defaultTop;
        return;
      }
      const noticeRect = currentNotice.getBoundingClientRect();
      const gateRect = gate.getBoundingClientRect();
      const overlapsHorizontally =
        noticeRect.left < gateRect.right && noticeRect.right > gateRect.left;
      if (!overlapsHorizontally) {
        currentNotice.style.bottom = defaultBottom;
        currentNotice.style.top = defaultTop;
        return;
      }
      resizeObserver?.observe(gate);
      resizeObserver?.observe(currentNotice);
      // Keep the sign-in invitation at its normal position, and move the
      // release notice above its top edge. This avoids covering the sheet's
      // actions on short mobile screens and keeps the sheet fully usable.
      const gap = 12;
      // Use top coordinates from both elements directly. `innerHeight` can
      // describe the layout viewport while fixed-element rectangles follow
      // the mobile visual viewport, which can put a bottom-offset notice over
      // the sign-in sheet on browsers with collapsing browser chrome.
      const gateTop = gateRect.top;
      const noticeHeight = noticeRect.height;
      currentNotice.style.bottom = 'auto';
      currentNotice.style.top = `${Math.max(16, Math.floor(gateTop - noticeHeight - gap))}px`;
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    const mutationObserver = new MutationObserver(sync);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', sync);
    sync();
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (notice) {
        notice.style.bottom = defaultBottom;
        notice.style.top = defaultTop;
      }
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
  const dismiss = () => {
    if (release) {
      try { window.localStorage.setItem(DISMISSED_RELEASE_KEY, release); } catch { /* dismissal still applies for this visit */ }
    }
    setAvailable(false);
  };
  if (!available) return null;
  return <aside ref={noticeRef} data-release-refresh role="status" aria-live="polite" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }} className="fixed bottom-4 left-4 right-4 z-[79] mx-auto max-w-md rounded-2xl border border-blue-200 bg-white p-4 text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.18)] dark:border-blue-400/30 dark:bg-slate-900 dark:text-white sm:left-4 sm:right-auto sm:mx-0 sm:max-w-sm">
    <div className="flex items-start justify-between gap-3">
      <p className="font-semibold">Top100 has been updated</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss update notice" className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
        <X aria-hidden="true" size={18} />
      </button>
    </div>
    {message && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">{busy ? 'Preparing refresh…' : 'Refresh now'}</button>
  </aside>;
}
