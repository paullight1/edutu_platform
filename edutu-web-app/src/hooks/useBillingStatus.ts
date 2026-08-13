import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBillingStatus, type BillingStatus } from '../services/billing';

export function useBillingStatus() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus(null);
      setLoading(false);
      return;
    }

    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Unable to read auth token');
      const nextStatus = await getBillingStatus(token);
      if (version === requestVersion.current) setStatus(nextStatus);
    } catch (err) {
      if (version === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Unable to load billing status');
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  return { status, loading, error, refresh };
}
