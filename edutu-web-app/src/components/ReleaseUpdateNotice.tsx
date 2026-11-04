import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'react-router-dom';
import { RefreshCw, X } from 'lucide-react';
import { deployedRelease, refreshRelease } from '../lib/releaseUpdate';

const DISMISSED_RELEASE_KEY = 'edutu.dismissed-release-update';

function wasDismissed(userId: string, release: string) {
  try { return window.localStorage.getItem(`${DISMISSED_RELEASE_KEY}:${encodeURIComponent(userId)}`) === release; }
  catch { return false; }
}

interface ReleaseUpdateNoticeProps {
  /** Release prompts belong to an authenticated learner's dashboard only. */
  userId?: string | null;
}

export default function ReleaseUpdateNotice({ userId }: ReleaseUpdateNoticeProps) {
  const { pathname } = useLocation();
  const isUserDashboard = Boolean(userId) && (pathname === '/dashboard' || pathname === '/app/home');
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
          setAvailable(latest !== __APP_RELEASE__ && !wasDismissed(userId!, latest));
        }
        if ('serviceWorker' in navigator) await (await navigator.serviceWorker.getRegistration())?.update();
      } catch { /* Offline or deployment in progress: try again on the next resume. */ }
      finally { checking = false; }
    };
    const requested = () => {
      void deployedRelease().then(latest => {
        if (disposed) return;
        setRelease(latest);
        setAvailable(latest !== __APP_RELEASE__ && !wasDismissed(userId!, latest));
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
  }, [isUserDashboard, userId]);
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
      try { window.localStorage.setItem(`${DISMISSED_RELEASE_KEY}:${encodeURIComponent(userId!)}`, release); } catch { /* dismissal still applies for this visit */ }
    }
    setAvailable(false);
  };
  if (!isUserDashboard || !available) return null;
  return createPortal(<aside data-release-refresh role="status" aria-live="polite" className="release-update-toast fixed z-[60] rounded-[18px] border border-subtle bg-surface-layer p-4 pr-12 text-text-primary shadow-elevated">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600"><RefreshCw aria-hidden="true" size={16} /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Edutu has been updated</p>
        <p className="mt-1 text-xs text-text-secondary">Refresh for the latest version. Your saved drafts will be kept.</p>
        {message && <p className="mt-2 text-xs text-danger">{message}</p>}
      </div>
    </div>
    <div className="mt-3 flex items-center pl-11">
      <button type="button" disabled={busy} onClick={() => void refresh()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50">{busy && <RefreshCw aria-hidden="true" size={14} className="animate-spin" />}{busy ? 'Preparing refresh…' : 'Refresh now'}</button>
      <button type="button" onClick={dismiss} aria-label="Dismiss update notice" title="Dismiss update notice" className="absolute right-1 top-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
        <X aria-hidden="true" size={18} />
      </button>
    </div>
  </aside>, document.body);
}
