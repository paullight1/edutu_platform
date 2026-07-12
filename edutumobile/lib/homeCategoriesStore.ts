import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toSafeUUID } from '@edutu/core/src/utils/auth';
import {
  DEFAULT_HOME_TILES,
  sanitizeHomeTiles,
  type HomeCategoryTile,
} from './discoveryCategories';

// v1 stored a plain id array; v2 stores the widget layout ({id, size}[],
// order = homepage order). v1 is still read once as a migration source.
const STORAGE_KEY_V1 = 'edutu.homeCategories.v1';
const STORAGE_KEY_V2 = 'edutu.homeCategories.v2';

function lookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

async function readLocal(): Promise<HomeCategoryTile[] | null> {
  try {
    const rawV2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) return sanitizeHomeTiles(JSON.parse(rawV2));
    const rawV1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) return sanitizeHomeTiles(JSON.parse(rawV1));
    return null;
  } catch {
    return null;
  }
}

async function writeLocal(tiles: HomeCategoryTile[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(tiles));
  } catch {
    // Local cache only — safe to ignore.
  }
}

async function readRemote(userId: string): Promise<HomeCategoryTile[] | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, preferences')
      .in('user_id', lookupIds(userId));
    if (error || !data?.length) return null;
    // Prefer the layout (sizes + order); fall back to the legacy id list.
    const layoutRow = data.find((r: any) => Array.isArray(r?.preferences?.home_categories_layout));
    if (layoutRow) return sanitizeHomeTiles(layoutRow.preferences.home_categories_layout);
    const legacyRow = data.find((r: any) => Array.isArray(r?.preferences?.home_categories));
    if (legacyRow) return sanitizeHomeTiles(legacyRow.preferences.home_categories);
    return null;
  } catch {
    return null;
  }
}

async function writeRemote(userId: string, tiles: HomeCategoryTile[]): Promise<void> {
  try {
    const ids = lookupIds(userId);
    // Keep the legacy plain-id key in sync so older builds still honour the
    // selection (they just render everything card-sized).
    const patch = {
      home_categories: tiles.map((tile) => tile.id),
      home_categories_layout: tiles,
    };
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
            .update({ preferences: { ...(row.preferences ?? {}), ...patch } })
            .eq('user_id', row.user_id),
        ),
      );
    } else {
      await supabase
        .from('profiles')
        .upsert({ user_id: userId, preferences: patch }, { onConflict: 'user_id' });
    }
  } catch {
    // Remote sync is best-effort; the local cache already holds the choice.
  }
}

export function useHomeCategories(userId?: string | null) {
  const [tiles, setTiles] = useState<HomeCategoryTile[]>(DEFAULT_HOME_TILES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await readLocal();
      if (!cancelled && local) setTiles(local);
      if (userId) {
        const remote = await readRemote(userId);
        if (!cancelled && remote) {
          setTiles(remote);
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
    (next: HomeCategoryTile[]) => {
      const cleaned = sanitizeHomeTiles(next);
      setTiles(cleaned);
      void writeLocal(cleaned);
      if (userId) void writeRemote(userId, cleaned);
    },
    [userId],
  );

  return { tiles, save, loaded };
}
