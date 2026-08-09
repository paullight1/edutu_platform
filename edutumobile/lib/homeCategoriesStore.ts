import React, { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchHomeCategoryLayout,
  updateHomeCategoryLayout,
  type HomeCategoryLayoutSnapshot,
} from '@edutu/core/src/services/profile';
import type { GetAuthToken } from '@edutu/core/src/services/productApi';
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
const UNVERSIONED_TIMESTAMP = new Date(0).toISOString();

type LocalSnapshot = {
  tiles: HomeCategoryTile[];
  updatedAt: string;
};

// Keeps the last resolved shape available synchronously when the home screen
// remounts during the same app session. AsyncStorage remains the durable source.
const memorySnapshots = new Map<string, LocalSnapshot>();

/** Test isolation for the intentional process-lifetime cache. */
export function __resetHomeCategoryMemoryForTests(): void {
  memorySnapshots.clear();
}

function scopedStorageKey(userId?: string | null): string {
  return `${STORAGE_KEY_V3_PREFIX}.${userId || 'guest'}`;
}

function snapshotFromUnknown(value: unknown): LocalSnapshot | null {
  if (Array.isArray(value)) {
    return { tiles: sanitizeHomeTiles(value), updatedAt: UNVERSIONED_TIMESTAMP };
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as { tiles?: unknown; updatedAt?: unknown };
  if (!Array.isArray(record.tiles)) return null;
  const parsedTimestamp =
    typeof record.updatedAt === 'string' && Number.isFinite(Date.parse(record.updatedAt))
      ? record.updatedAt
      : UNVERSIONED_TIMESTAMP;
  return { tiles: sanitizeHomeTiles(record.tiles), updatedAt: parsedTimestamp };
}

async function readLocal(userId?: string | null): Promise<LocalSnapshot | null> {
  try {
    const storageKey = scopedStorageKey(userId);
    const scoped = await AsyncStorage.getItem(scopedStorageKey(userId));
    if (scoped) {
      const snapshot = snapshotFromUnknown(JSON.parse(scoped));
      if (snapshot) memorySnapshots.set(storageKey, snapshot);
      return snapshot;
    }
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
      const migrated: LocalSnapshot = {
        tiles: sanitizeHomeTiles(JSON.parse(legacy)),
        updatedAt: UNVERSIONED_TIMESTAMP,
      };
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
      memorySnapshots.set(storageKey, migrated);
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeLocal(
  userId: string | null | undefined,
  snapshot: LocalSnapshot,
): Promise<void> {
  memorySnapshots.set(scopedStorageKey(userId), snapshot);
  try {
    await AsyncStorage.setItem(scopedStorageKey(userId), JSON.stringify(snapshot));
  } catch {
    // Local cache only — safe to ignore.
  }
}

function normalizeRemote(snapshot: HomeCategoryLayoutSnapshot | null): LocalSnapshot | null {
  if (!snapshot?.tiles?.length) return null;
  return {
    tiles: sanitizeHomeTiles(snapshot.tiles),
    updatedAt:
      snapshot.updatedAt && Number.isFinite(Date.parse(snapshot.updatedAt))
        ? snapshot.updatedAt
        : UNVERSIONED_TIMESTAMP,
  };
}

function newerSnapshot(
  local: LocalSnapshot | null,
  remote: LocalSnapshot | null,
): LocalSnapshot | null {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(remote.updatedAt) > Date.parse(local.updatedAt) ? remote : local;
}

async function readRemote(
  getAuthToken: GetAuthToken,
): Promise<LocalSnapshot | null> {
  try {
    return normalizeRemote(await fetchHomeCategoryLayout(getAuthToken));
  } catch {
    // The local snapshot remains usable offline. A later mount or explicit
    // save will retry the backend without blocking the home screen.
    return null;
  }
}

async function pushRemote(
  getAuthToken: GetAuthToken,
  snapshot: LocalSnapshot,
): Promise<LocalSnapshot | null> {
  try {
    return normalizeRemote(await updateHomeCategoryLayout(getAuthToken, snapshot));
  } catch {
    // Best-effort sync: the versioned local snapshot is the retry source.
    return null;
  }
}

export function useHomeCategories(
  userId?: string | null,
  getAuthToken?: GetAuthToken,
) {
  const currentScope = scopedStorageKey(userId);
  const initialSnapshot = memorySnapshots.get(currentScope);
  const [stateScope, setStateScope] = useState(currentScope);
  const [tiles, setTiles] = useState<HomeCategoryTile[]>(
    initialSnapshot?.tiles ?? DEFAULT_HOME_TILES,
  );
  const [loaded, setLoaded] = useState(Boolean(initialSnapshot));
  const scopeRef = React.useRef(currentScope);

  useEffect(() => {
    scopeRef.current = currentScope;
  }, [currentScope]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Start the network request concurrently, but never make a warm local
      // layout wait for Clerk refresh or a cold backend before it can render.
      const remotePromise = userId && getAuthToken
        ? readRemote(getAuthToken)
        : Promise.resolve(null);
      const local = await readLocal(userId);
      if (cancelled) return;

      setStateScope(currentScope);
      if (local) {
        setTiles(local.tiles);
        setLoaded(true);
      } else {
        setTiles(DEFAULT_HOME_TILES);
        setLoaded(false);
      }

      const remote = await remotePromise;
      if (cancelled) return;
      const winner = newerSnapshot(local, remote);
      if (winner) {
        setTiles(winner.tiles);
        await writeLocal(userId, winner);
      }
      if (
        userId &&
        getAuthToken &&
        local &&
        winner === local &&
        (!remote || Date.parse(local.updatedAt) > Date.parse(remote.updatedAt))
      ) {
        const accepted = await pushRemote(getAuthToken, local);
        if (
          accepted &&
          Date.parse(accepted.updatedAt) > Date.parse(local.updatedAt)
        ) {
          setTiles(accepted.tiles);
          await writeLocal(userId, accepted);
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentScope, getAuthToken, userId]);

  const save = useCallback(
    (next: HomeCategoryTile[]) => {
      const cleaned = sanitizeHomeTiles(next);
      const local: LocalSnapshot = {
        tiles: cleaned,
        updatedAt: new Date().toISOString(),
      };
      setStateScope(currentScope);
      setTiles(cleaned);
      setLoaded(true);
      void writeLocal(userId, local);
      if (userId && getAuthToken) {
        void pushRemote(getAuthToken, local).then((accepted) => {
          if (
            scopeRef.current === currentScope &&
            accepted &&
            Date.parse(accepted.updatedAt) > Date.parse(local.updatedAt)
          ) {
            setTiles(accepted.tiles);
            void writeLocal(userId, accepted);
          }
        });
      }
    },
    [currentScope, getAuthToken, userId],
  );

  return {
    tiles: stateScope === currentScope ? tiles : DEFAULT_HOME_TILES,
    save,
    loaded: stateScope === currentScope ? loaded : false,
  };
}
