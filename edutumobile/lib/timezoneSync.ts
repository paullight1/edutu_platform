import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProfile } from '@edutu/core/src/services/profile';
import type { GetAuthToken } from '@edutu/core/src/services/productApi';

const TIMEZONE_KEY = '@edutu_synced_timezone';

/**
 * The last IANA zone we successfully wrote to the profile. Persisted so the
 * sync is a no-op on every launch after the first: without it we'd PATCH the
 * profile on every cold start for every user, which is pure write traffic for
 * a value that changes maybe once a year (travel, DST-less relocation).
 */
async function readLastSynced(): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(TIMEZONE_KEY);
    } catch {
        return null;
    }
}

/** The device's IANA zone, or null when the runtime can't report one. */
export function getDeviceTimezone(): string | null {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof zone === 'string' && zone.length > 0 ? zone : null;
    } catch {
        return null;
    }
}

/**
 * Pushes the device timezone onto the user's profile so server-side quiet
 * hours (22:00–08:00) are evaluated in local time. The backend falls back to
 * UTC when the column is empty, which silences or mistimes alerts for the
 * whole West/East African user base.
 *
 * Idempotent and fail-quiet: it writes only when the zone differs from the
 * last successful sync, and any failure (offline, 401, 5xx) is swallowed so
 * launch is never blocked. Reuses the existing backend `PATCH /profile`
 * endpoint via `updateProfile` — no new endpoint or service.
 */
export async function syncDeviceTimezone(getAuthToken: GetAuthToken): Promise<void> {
    try {
        const timezone = getDeviceTimezone();
        if (!timezone) return;

        const lastSynced = await readLastSynced();
        if (lastSynced === timezone) return;

        const updated = await updateProfile(getAuthToken, { timezone });
        // updateProfile resolves null on failure; only a confirmed write may
        // mark the zone as synced, otherwise a transient 401 would suppress
        // every future attempt.
        if (!updated) return;

        await AsyncStorage.setItem(TIMEZONE_KEY, timezone).catch(() => undefined);
    } catch {
        // Non-fatal — alerts fall back to UTC quiet hours until the next launch.
    }
}
