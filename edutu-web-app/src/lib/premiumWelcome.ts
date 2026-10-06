const PREMIUM_WELCOME_PREFIX = "edutu:premium-welcome:v1";

function storageKey(userId: string, state: "pending" | "seen") {
  return `${PREMIUM_WELCOME_PREFIX}:${state}:${userId}`;
}

export function markPremiumWelcomePending(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return;

  try {
    if (window.localStorage.getItem(storageKey(userId, "seen")) !== "1") {
      window.localStorage.setItem(storageKey(userId, "pending"), "1");
    }
  } catch {
    // The intro is helpful but must never interrupt onboarding if storage is unavailable.
  }
}

/** Opens once after successful onboarding, then remains dismissed for that account. */
export function consumePremiumWelcome(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;

  try {
    const pendingKey = storageKey(userId, "pending");
    const seenKey = storageKey(userId, "seen");
    if (window.localStorage.getItem(pendingKey) !== "1") return false;

    window.localStorage.removeItem(pendingKey);
    if (window.localStorage.getItem(seenKey) === "1") return false;

    window.localStorage.setItem(seenKey, "1");
    return true;
  } catch {
    return false;
  }
}
