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
const STORAGE_KEY_V3_PREFIX = 'edutu.homeCategories.v3';
const LEGACY_MIGRATION_CLAIM_KEY = 'edutu.homeCategories.v3.legacyClaimed';

function scopedStorageKey(userId?: string | null): string {
  return `${STORAGE_KEY_V3_PREFIX}.${userId || 'guest'}`;
}

function lookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

async function readLocal(userId?: string | null): Promise<HomeCategoryTile[] | null> {
  try {
    const scoped = await AsyncStorage.getItem(scopedStorageKey(userId));
    if (scoped) return sanitizeHomeTiles(JSON.parse(scoped));
    // Auth can briefly report no user while Clerk restores its session. Do not
    // let that transient guest scope claim a signed-in user's legacy layout.
    if (!userId) return null;
    const legacyAlreadyClaimed = await AsyncStorage.getItem(
      LEGACY_MIGRATION_CLAIM_KEY,
    );
    if (legacyAlreadyClaimed) return null;
    // Consume the old device-wide cache exactly once. Leaving it behind meant
    // every later account on the same device inherited the first account's
    // layout when its own scoped key was empty.
    const rawV2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
    const rawV1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
    const legacy = rawV2 ?? rawV1;
    if (legacy) {
      const migrated = sanitizeHomeTiles(JSON.parse(legacy));
      // Persist the scoped copy before removing the source so a storage failure
      // cannot discard the user's layout midway through migration.
      await AsyncStorage.setItem(scopedStorageKey(userId), JSON.stringify(migrated));
      // The claim marker is the privacy boundary. If a platform-specific
      // removeItem call fails, another signed-in account must still never read
      // the old device-wide value.
      await AsyncStorage.setItem(LEGACY_MIGRATION_CLAIM_KEY, '1');
      await Promise.allSettled([
        AsyncStorage.removeItem(STORAGE_KEY_V2),
        AsyncStorage.removeItem(STORAGE_KEY_V1),
      ]);
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeLocal(userId: string | null | undefined, tiles: HomeCategoryTile[]): Promise<void> {
  try {
    await AsyncStorage.setItem(scopedStorageKey(userId), JSON.stringify(tiles));
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
  const currentScope = scopedStorageKey(userId);
  const [stateScope, setStateScope] = useState(currentScope);
  const [tiles, setTiles] = useState<HomeCategoryTile[]>(DEFAULT_HOME_TILES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The hook can survive logout/login transitions inside the app shell.
    // Clear the previous account's in-memory layout before reading the next
    // scoped cache so it cannot remain visible when the next account has none.
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setStateScope(currentScope);
      setTiles(DEFAULT_HOME_TILES);
      setLoaded(false);
      const local = await readLocal(userId);
      if (local) {
        if (!cancelled) setTiles(local);
        await writeLocal(userId, local);
        // Local is authoritative on this device. Re-sync it instead of letting
        // a failed or delayed older remote write undo the user's latest order.
        if (userId) void writeRemote(userId, local);
      } else if (userId) {
        const remote = await readRemote(userId);
        if (!cancelled && remote) {
          setTiles(remote);
          await writeLocal(userId, remote);
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentScope, userId]);

  const save = useCallback(
    (next: HomeCategoryTile[]) => {
      const cleaned = sanitizeHomeTiles(next);
      setStateScope(currentScope);
      setTiles(cleaned);
      void writeLocal(userId, cleaned);
      if (userId) void writeRemote(userId, cleaned);
    },
    [currentScope, userId],
  );

  return {
    tiles: stateScope === currentScope ? tiles : DEFAULT_HOME_TILES,
    save,
    loaded: stateScope === currentScope ? loaded : false,
  };
}
