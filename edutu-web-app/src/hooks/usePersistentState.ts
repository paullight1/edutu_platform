import { useState, useEffect } from 'react';

/**
 * Lightweight wrapper around localStorage that keeps React state in sync.
 * Falls back gracefully when window/localStorage are unavailable.
 */
export function usePersistentState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) {
        return defaultValue;
      }

      return JSON.parse(stored) as T;
    } catch (error) {
      console.warn(`Failed to parse persistent state for key "${key}".`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to persist state for key "${key}".`, error);
    }
  }, [key, value]);

  return [value, setValue] as const;
}

