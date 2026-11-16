import * as React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/clerk-expo';
import { PENDING_REFERRAL_KEY } from '@edutu/core/src/services/referrals';

/**
 * Deep-link capture for `edutu://invite?code=ABC` and the universal
 * `https://edutu.org/invite?code=ABC`. Expo Router matches the path here; we
 * stash the code so it survives account creation, then route the user on:
 *  - signed out  → sign-up (the field pre-fills from the stash)
 *  - signed in   → the invite screen (nothing to redeem for an existing
 *                  account; the `too_late` gate would reject it anyway)
 *
 * Redemption itself runs from the post-auth effect in `(app)/_layout.tsx`.
 */
export default function InviteDeepLinkRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [stashed, setStashed] = React.useState(false);

  React.useEffect(() => {
    const trimmed = code?.trim();
    // setStashed only ever fires inside an async callback (never synchronously
    // in the effect body) so the React Compiler lint rule stays satisfied.
    const persist = trimmed
      ? AsyncStorage.setItem(PENDING_REFERRAL_KEY, trimmed).catch((err) =>
          console.warn('Failed to stash referral code:', err),
        )
      : Promise.resolve();
    void persist.finally(() => setStashed(true));
  }, [code]);

  // Wait until Clerk resolves and the code is persisted before redirecting,
  // so we neither drop the code nor bounce to the wrong destination.
  if (!isLoaded || !stashed) return null;

  return <Redirect href={isSignedIn ? '/(app)/referrals' : '/(auth)/sign-up'} />;
}
