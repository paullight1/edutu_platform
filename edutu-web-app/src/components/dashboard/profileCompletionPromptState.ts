const MATCHING_THRESHOLD = 60;
const DISMISSED_SESSION_STORAGE_KEY = "edutu_profile_prompt_dismissed_session";

type ProfilePromptStorage = Pick<Storage, "getItem" | "setItem">;

interface ProfilePromptState {
  isSignedIn: boolean;
  profileScore: number | null;
  dismissed: boolean;
}

export function shouldShowProfileCompletionPrompt({
  isSignedIn,
  profileScore,
  dismissed,
}: ProfilePromptState) {
  return (
    isSignedIn &&
    profileScore !== null &&
    profileScore < MATCHING_THRESHOLD &&
    !dismissed
  );
}

export function readDismissedProfilePromptSession(
  storage: ProfilePromptStorage | null,
) {
  if (!storage) return null;

  try {
    return storage.getItem(DISMISSED_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function dismissProfilePromptForSession(
  storage: ProfilePromptStorage | null,
  sessionId: string,
) {
  if (!storage) return;

  try {
    storage.setItem(DISMISSED_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Session storage may be unavailable in hardened browser contexts. The
    // dashboard's in-memory state still dismisses the prompt for this mount.
  }
}
