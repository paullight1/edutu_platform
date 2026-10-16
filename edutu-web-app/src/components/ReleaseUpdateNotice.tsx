import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'react-router-dom';
import { RefreshCw, X } from 'lucide-react';
import { deployedRelease, refreshRelease } from '../lib/releaseUpdate';

const DISMISSED_RELEASE_KEY = 'edutu.dismissed-release-update';

function wasDismissed(release: string) {
  try { return window.localStorage.getItem(DISMISSED_RELEASE_KEY) === release; }
  catch { return false; }
}

export default function ReleaseUpdateNotice() {
  const { pathname } = useLocation();
  const isUserDashboard = pathname === '/dashboard' || pathname === '/app/home';
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [release, setRelease] = useState('');
  useEffect(() => {
    if (!isUserDashboard || !import.meta.env.PROD || Capacitor.isNativePlatform()) return;
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
  }, [isUserDashboard]);
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
  if (!isUserDashboard || !available) return null;
  return <aside data-release-refresh role="status" aria-live="polite" className="relative mb-5 flex flex-col gap-4 rounded-2xl border border-blue-200 bg-white p-4 pr-14 text-slate-900 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pr-14">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><RefreshCw aria-hidden="true" size={19} /></span>
      <div className="min-w-0">
        <p className="font-semibold">Top100 has been updated</p>
        <p className="mt-1 text-sm text-slate-600">Refresh to load the latest version. Your saved drafts will be kept.</p>
        {message && <p className="mt-2 text-sm text-red-700">{message}</p>}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
      <button type="button" disabled={busy} onClick={() => void refresh()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-medium text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50">{busy && <RefreshCw aria-hidden="true" size={16} className="animate-spin" />}{busy ? 'Preparing refresh…' : 'Refresh now'}</button>
      <button type="button" onClick={dismiss} aria-label="Dismiss update notice" title="Dismiss update notice" className="absolute right-3 top-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:right-4 sm:top-4">
        <X aria-hidden="true" size={18} />
      </button>
    </div>
  </aside>;
}
