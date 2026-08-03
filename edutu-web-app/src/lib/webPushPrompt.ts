/**
 * Dismissal memory for contextual web-push opt-in prompts.
 *
 * A prompt the user dismissed must stay dismissed across reloads and sessions,
 * so the decision is persisted per surface id in localStorage. Storage access is
 * wrapped because Safari private mode and some embedded webviews throw on it.
 */

const PREFIX = "edutu:webpush-prompt-dismissed:";

export function webPushPromptKey(promptId: string): string {
  return `${PREFIX}${promptId}`;
}

export function isWebPushPromptDismissed(promptId: string): boolean {
  try {
    return window.localStorage.getItem(webPushPromptKey(promptId)) === "1";
  } catch {
    return false;
  }
}

export function dismissWebPushPrompt(promptId: string): void {
  try {
    window.localStorage.setItem(webPushPromptKey(promptId), "1");
  } catch {
    /* storage unavailable — prompt simply reappears next session */
  }
}

export function resetWebPushPrompt(promptId: string): void {
  try {
    window.localStorage.removeItem(webPushPromptKey(promptId));
  } catch {
    /* no-op */
  }
}
