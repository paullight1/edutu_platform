import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toSafeUUID } from '@edutu/core/src/utils/auth';
import {
  DEFAULT_HOME_CATEGORIES,
  sanitizeHomeCategories,
  type DiscoveryCategoryId,
} from './discoveryCategories';

const STORAGE_KEY = 'edutu.homeCategories.v1';

function lookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

async function readLocal(): Promise<DiscoveryCategoryId[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeHomeCategories(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocal(slugs: DiscoveryCategoryId[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // Local cache only — safe to ignore.
  }
}

async function readRemote(userId: string): Promise<DiscoveryCategoryId[] | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, preferences')
      .in('user_id', lookupIds(userId));
    if (error || !data?.length) return null;
    const row = data.find((r: any) => Array.isArray(r?.preferences?.home_categories)) ?? data[0];
    const stored = row?.preferences?.home_categories;
    return Array.isArray(stored) ? sanitizeHomeCategories(stored) : null;
  } catch {
    return null;
  }
}

async function writeRemote(userId: string, slugs: DiscoveryCategoryId[]): Promise<void> {
  try {
    const ids = lookupIds(userId);
    const { data } = await supabase
      .from('profiles')
      .select('user_id, preferences')
      .in('user_id', ids);
    if (data?.length) {
      // Merge so other preference keys survive the write.
      await Promise.all(
        data.map((row: any) =>
          supabase
            .from('profiles')
            .update({ preferences: { ...(row.preferences ?? {}), home_categories: slugs } })
            .eq('user_id', row.user_id),
        ),
      );
    } else {
      await supabase
        .from('profiles')
        .upsert({ user_id: userId, preferences: { home_categories: slugs } }, { onConflict: 'user_id' });
    }
  } catch {
    // Remote sync is best-effort; the local cache already holds the choice.
  }
}

export function useHomeCategories(userId?: string | null) {
  const [selected, setSelected] = useState<DiscoveryCategoryId[]>(DEFAULT_HOME_CATEGORIES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await readLocal();
      if (!cancelled && local) setSelected(local);
      if (userId) {
        const remote = await readRemote(userId);
        if (!cancelled && remote) {
          setSelected(remote);
          await writeLocal(remote);
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = useCallback(
    (slugs: DiscoveryCategoryId[]) => {
      const cleaned = sanitizeHomeCategories(slugs);
      setSelected(cleaned);
      void writeLocal(cleaned);
      if (userId) void writeRemote(userId, cleaned);
    },
    [userId],
  );

  return { selected, save, loaded };
}
