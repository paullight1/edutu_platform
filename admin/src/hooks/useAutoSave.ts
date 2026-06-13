import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAutoSaveOptions {
  key: string;
  data: Record<string, unknown>;
  interval?: number; // milliseconds, default 5000
  enabled?: boolean;
}

interface UseAutoSaveReturn {
  savedAt: Date | null;
  hasDraft: boolean;
  clearDraft: () => void;
  restoreDraft: () => Record<string, unknown> | null;
}

export function useAutoSave({
  key,
  data,
  interval = 5000,
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const storageKey = `edutu_autosave:${key}`;
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(() => {
    try {
      return !!localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  });
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Auto-save on interval
  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      try {
        const current = dataRef.current;
        if (current && Object.keys(current).length > 0) {
          localStorage.setItem(storageKey, JSON.stringify(current));
          setSavedAt(new Date());
          setHasDraft(true);
        }
      } catch (error) {
        console.error('AutoSave failed:', error);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [storageKey, interval, enabled]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setSavedAt(null);
      setHasDraft(false);
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, [storageKey]);

  const restoreDraft = useCallback((): Record<string, unknown> | null => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [storageKey]);

  return { savedAt, hasDraft, clearDraft, restoreDraft };
}
