import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const OPT_IN_ASKED_KEY = '@edutu_push_optin_asked';

/**
 * Whether we may show the contextual push opt-in.
 *
 * Two hard gates, both non-negotiable:
 *  1. OS permission must still be `undetermined`. iOS shows the system prompt
 *     exactly once per install — after a denial a second request silently
 *     no-ops, so offering again only burns trust for nothing.
 *  2. We ask at most once, ever. The flag is cleared only when the user opts
 *     in deliberately from notification settings (`resetPushOptInAsked`).
 */
export async function canOfferPushOptIn(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
        const asked = await AsyncStorage.getItem(OPT_IN_ASKED_KEY);
        if (asked) return false;

        const { status } = await Notifications.getPermissionsAsync();
        return status === 'undetermined';
    } catch {
        // If we can't tell, don't prompt — a wrongly-timed system prompt is
        // unrecoverable, a missed one is not.
        return false;
    }
}

/** Records that the contextual offer was shown, whichever way it was answered. */
export async function markPushOptInAsked(): Promise<void> {
    try {
        await AsyncStorage.setItem(OPT_IN_ASKED_KEY, '1');
    } catch {
        // Worst case the offer appears once more on a later save.
    }
}

/**
 * Re-arms the contextual offer. Called when the user turns push off from
 * settings, so that a later save can offer it again rather than leaving them
 * with no path back other than the settings screen.
 */
export async function resetPushOptInAsked(): Promise<void> {
    try {
        await AsyncStorage.removeItem(OPT_IN_ASKED_KEY);
    } catch {
        // Best-effort.
    }
}

/** True when the deadline exists and has not already passed. */
export function hasFutureDeadline(deadline?: string | null): boolean {
    if (!deadline) return false;
    const parsed = new Date(deadline);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() > Date.now();
}
