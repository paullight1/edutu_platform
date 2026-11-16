import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConfig } from '../../lib/config';

const OFFLINE_STATE_KEY = 'edutu_offline_state';

interface OfflineContextValue {
  isOffline: boolean;
  showIndicator: boolean;
  lastCheckedAt: number | null;
  refresh: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

async function probeConnectivity(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(getConfig().apiBaseUrl, {
      method: 'GET',
      signal,
      headers: { Accept: 'application/json' },
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const refresh = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const online = await probeConnectivity(controller.signal);

    clearTimeout(timeoutId);
    const checkedAt = Date.now();
    setIsOffline((previous) => {
      const nextOffline = !online;
      if (!previous && nextOffline) {
        setShowIndicator(true);
      }
      if (previous && !nextOffline) {
        setShowIndicator(false);
      }
      return nextOffline;
    });
    setLastCheckedAt(checkedAt);
    await AsyncStorage.setItem(
      OFFLINE_STATE_KEY,
      JSON.stringify({ isOffline: !online, lastCheckedAt: checkedAt }),
    );
  };

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(OFFLINE_STATE_KEY);
        if (raw && isMounted) {
          const cached = JSON.parse(raw) as { isOffline?: boolean; lastCheckedAt?: number };
          setIsOffline(Boolean(cached.isOffline));
          setLastCheckedAt(cached.lastCheckedAt ?? null);
        }
      } catch {
        // Ignore stale offline cache.
      } finally {
        void refresh();
      }
    };

    hydrate();

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });

    const intervalId = setInterval(() => {
      void refresh();
    }, 20000);

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!showIndicator) {
      return;
    }

    const indicatorTimeout = setTimeout(() => {
      setShowIndicator(false);
    }, 4000);

    return () => clearTimeout(indicatorTimeout);
  }, [showIndicator]);

  const value = useMemo(
    () => ({ isOffline, showIndicator, lastCheckedAt, refresh }),
    [isOffline, showIndicator, lastCheckedAt],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);

  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }

  return context;
}
