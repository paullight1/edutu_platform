import { useCallback, useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useAuth as useAppAuth } from "./useAuth";
import {
  getWebPushState,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  type WebPushState,
} from "../lib/webPush";

/**
 * Single source of truth for web-push subscription state in the UI.
 *
 * Every opt-in surface (settings toggle, contextual prompts, the legacy
 * header button) goes through this hook so there is exactly one subscription
 * path — `src/lib/webPush.ts`.
 *
 * `enable()` must be invoked from a real user gesture: browsers only show the
 * permission prompt inside a user-activation window, so it is deliberately not
 * exposed as an effect.
 */
export interface UseWebPushResult {
  /** null while the initial async probe is in flight. */
  state: WebPushState | null;
  busy: boolean;
  /** True once the state has been probed at least once. */
  ready: boolean;
  /** Call from a click handler only. */
  enable: () => Promise<WebPushState | null>;
  disable: () => Promise<void>;
}

export function useWebPush(): UseWebPushResult {
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getWebPushState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!user?.id) return null;
    setBusy(true);
    try {
      const token = await getToken().catch(() => null);
      const next = await subscribeToWebPush(user.id, token);
      setState(next);
      return next;
    } catch (error) {
      console.error("Failed to enable web push", error);
      return null;
    } finally {
      setBusy(false);
    }
  }, [getToken, user?.id]);

  const disable = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const token = await getToken().catch(() => null);
      await unsubscribeFromWebPush(user.id, token);
      setState(await getWebPushState());
    } catch (error) {
      console.error("Failed to disable web push", error);
    } finally {
      setBusy(false);
    }
  }, [getToken, user?.id]);

  return { state, busy, ready: state !== null, enable, disable };
}
