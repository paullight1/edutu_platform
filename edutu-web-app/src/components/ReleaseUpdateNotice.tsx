import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { deployedRelease, refreshRelease } from '../lib/releaseUpdate';

export default function ReleaseUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mobileBottom, setMobileBottom] = useState<number | null>(null);
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
    let observedGate: HTMLElement | null = null;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sync());
    const sync = () => {
      const gate = compact.matches ? document.querySelector<HTMLElement>('[data-google-sign-in-gate]') : null;
      if (gate !== observedGate) {
        resizeObserver?.disconnect();
        observedGate = gate;
        if (gate) resizeObserver?.observe(gate);
      }
      if (!gate) {
        setMobileBottom(null);
        return;
      }
      // Put the update card just above the sign-in invitation. Measuring the
      // actual card avoids relying on :has() support or a guessed card height.
      const gateTop = gate.getBoundingClientRect().top;
      setMobileBottom(Math.max(16, Math.ceil(window.innerHeight - gateTop + 12)));
    };
    const mutationObserver = new MutationObserver(sync);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    compact.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    sync();
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      compact.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);
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
  return <aside data-release-refresh role="status" aria-live="polite" style={mobileBottom === null ? undefined : { bottom: `calc(${mobileBottom}px + env(safe-area-inset-bottom))` }} className="fixed bottom-20 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border border-blue-400/30 bg-slate-950 p-4 text-white shadow-xl">
    <p className="font-semibold">Top100 has been updated</p>
    {message && <p className="mt-2 text-sm">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-medium disabled:opacity-50">{busy ? 'Preparing refresh…' : 'Refresh now'}</button>
  </aside>;
}
