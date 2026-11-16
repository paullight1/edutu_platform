import { Linking, NativeModules, Platform } from "react-native";
import {
  getApiBaseUrl,
  type GetAuthToken,
} from "@edutu/core/src/services/productApi";
import { tokenCache } from "../../cache";
import { declineCommunityCall, leaveCommunityCall } from "./api";
import { parseIncomingCallPayload } from "./notifications";

export type NativeCallEvent = {
  type: "answer" | "decline" | "end";
  callId: string;
};
type Listener = (event: NativeCallEvent) => void;
const listeners = new Set<Listener>();
const queuedEvents: NativeCallEvent[] = [];
const incomingPayloads = new Map<string, Record<string, unknown>>();
const suppressedNativeEnds = new Set<string>();
let configured = false;

export function subscribeNativeCallEvents(listener: Listener) {
  listeners.add(listener);
  for (const event of queuedEvents.splice(0)) listener(event);
  return () => {
    listeners.delete(listener);
  };
}
function emit(event: NativeCallEvent) {
  if (!listeners.size) queuedEvents.push(event);
  for (const listener of listeners) listener(event);
}
async function runHeadlessCallAction(
  type: "decline" | "leave",
  callId: string,
) {
  try {
    const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) return;
    const { getClerkInstance } = await import("@clerk/clerk-expo");
    const clerk = getClerkInstance({ publishableKey, tokenCache });
    if (!clerk.session) await clerk.load();
    const session = clerk.session;
    if (!session) return;
    const getter = () => session.getToken();
    if (type === "decline") await declineCommunityCall(callId, getter);
    else await leaveCommunityCall(callId, getter);
  } catch {
    /* The server's missed-call finalizer remains the durable fallback. */
  }
}
async function callKeep(): Promise<any | null> {
  try {
    const mod = await import("react-native-callkeep");
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

export async function configureNativeCalling(): Promise<boolean> {
  const keep = await callKeep();
  if (!keep) return false;
  if (!configured) {
    await keep.setup({
      ios: { appName: "Edutu" },
      android: {
        alertTitle: "Phone account permission",
        alertDescription: "Allow Edutu to show scheduled community calls.",
        cancelButton: "Cancel",
        okButton: "Allow",
        selfManaged: false,
        additionalPermissions: [],
      },
    });
    keep.setAvailable?.(true);
    keep.addEventListener?.(
      "answerCall",
      ({ callUUID }: { callUUID: string }) => {
        emit({ type: "answer", callId: callUUID });
        const payload = incomingPayloads.get(callUUID);
        if (payload) void openIncomingCommunityCall(payload);
      },
    );
    keep.addEventListener?.("endCall", ({ callUUID }: { callUUID: string }) => {
      if (suppressedNativeEnds.delete(callUUID)) return;
      const incoming = incomingPayloads.has(callUUID);
      incomingPayloads.delete(callUUID);
      const hadListener = listeners.size > 0;
      emit({ type: incoming ? "decline" : "end", callId: callUUID });
      if (!hadListener)
        void runHeadlessCallAction(incoming ? "decline" : "leave", callUUID);
    });
    configured = true;
  }
  return true;
}

export async function displayIncomingCommunityCall(
  data: Record<string, unknown>,
): Promise<boolean> {
  const payload = parseIncomingCallPayload(data);
  if (!payload || !(await configureNativeCalling())) return false;
  incomingPayloads.set(payload.callId, data);
  const keep = await callKeep();
  if (!keep) return false;
  keep.displayIncomingCall(
    payload.callId,
    payload.groupName,
    payload.title,
    "generic",
    false,
  );
  return true;
}
export async function endNativeCommunityCall(callId: string) {
  const keep = await callKeep();
  if (!keep?.endCall) return;
  suppressedNativeEnds.add(callId);
  keep.endCall(callId);
  setTimeout(() => suppressedNativeEnds.delete(callId), 2_000);
}
export async function markNativeCommunityCallConnected(callId: string) {
  incomingPayloads.delete(callId);
  const keep = await callKeep();
  keep?.setCurrentCallActive?.(callId);
}
export async function setNativeAudioRoute(callId: string, route: string) {
  const keep = await callKeep();
  await keep?.setAudioRoute?.(callId, route);
}
export async function getNativeAudioRoutes(): Promise<
  Array<{ name: string; type: string; selected?: boolean }>
> {
  const keep = await callKeep();
  return (await keep?.getAudioRoutes?.()) ?? [];
}

export async function openIncomingCommunityCall(data: Record<string, unknown>) {
  const payload = parseIncomingCallPayload(data);
  if (!payload) return false;
  return Linking.openURL(
    `edutu://discussions/${payload.groupId}/calls/${payload.callId}?incoming=1`,
  ).then(
    () => true,
    () => false,
  );
}

export async function syncNativeCallingToken(
  provider: "apns-voip" | "fcm",
  token: string,
  getToken: GetAuthToken,
) {
  if (!token || token.length > 4096) return;
  const auth = await getToken();
  if (!auth) return;
  await fetch(`${getApiBaseUrl()}/notifications/push-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify({
      token,
      provider,
      device: { platform: Platform.OS, purpose: "community-calls" },
    }),
  }).catch(() => undefined);
}

let currentTokenGetter: GetAuthToken | null = null;
let currentTokenOwner: string | null = null;
const currentNativeTokens = new Map<"apns-voip" | "fcm", string>();
let tokenListenerCleanup: (() => void) | null = null;
let tokenSyncGeneration = 0;

async function unregisterTokens(getToken: GetAuthToken, tokens: string[]) {
  const auth = await getToken().catch(() => null);
  if (!auth) return;
  await Promise.all(
    tokens.map((token) =>
      fetch(
        `${getApiBaseUrl()}/notifications/push-token/${encodeURIComponent(token)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${auth}` } },
      ).catch(() => undefined),
    ),
  );
}

async function associateCurrentToken(
  provider: "apns-voip" | "fcm",
  token: string,
  owner: string,
  generation: number,
) {
  if (generation !== tokenSyncGeneration || currentTokenOwner !== owner) return;
  currentNativeTokens.set(provider, token);
  const getter = currentTokenGetter;
  if (getter) await syncNativeCallingToken(provider, token, getter);
}

export async function resetNativeCallingTokenSync(expectedOwner?: string) {
  if (expectedOwner && currentTokenOwner !== expectedOwner) return;
  tokenSyncGeneration += 1;
  const getter = currentTokenGetter;
  const tokens = [...currentNativeTokens.values()];
  currentTokenGetter = null;
  currentTokenOwner = null;
  currentNativeTokens.clear();
  tokenListenerCleanup?.();
  tokenListenerCleanup = null;

  // A CallKeep event from the previous account must never be delivered to the
  // next signed-in user on a shared device.
  queuedEvents.splice(0);
  const staleCallIds = [...incomingPayloads.keys()];
  incomingPayloads.clear();
  const keep = await callKeep();
  for (const callId of staleCallIds) {
    suppressedNativeEnds.add(callId);
    keep?.endCall?.(callId);
  }
  if (getter && tokens.length) await unregisterTokens(getter, tokens);
}

export async function registerNativeCallingTokenSync(
  userId: string,
  getToken: GetAuthToken,
) {
  if (Platform.OS === "web") return;
  if (currentTokenOwner && currentTokenOwner !== userId)
    await resetNativeCallingTokenSync(currentTokenOwner);
  tokenSyncGeneration += 1;
  const generation = tokenSyncGeneration;
  currentTokenOwner = userId;
  currentTokenGetter = getToken;
  if (Platform.OS === "android") {
    try {
      const module = await import("@react-native-firebase/messaging");
      const messaging = module.default;
      const token = await messaging().getToken();
      await associateCurrentToken("fcm", token, userId, generation);
      if (generation !== tokenSyncGeneration || currentTokenOwner !== userId)
        return;
      tokenListenerCleanup?.();
      tokenListenerCleanup = messaging().onTokenRefresh(
        (next: string) =>
          void associateCurrentToken("fcm", next, userId, generation),
      );
    } catch {
      /* Expo Go / unsupported build: ordinary Expo push remains active. */
    }
  } else if (Platform.OS === "ios") {
    // Keep PushKit optional in Expo Go and development builds that do not
    // include the VoIP native module. The package's module-scope emitter
    // otherwise throws before its import can be caught.
    if (!NativeModules.RNVoipPushNotificationManager) return;
    try {
      const module = await import("react-native-voip-push-notification");
      const voip = module.default ?? module;
      const onRegister = (token: string) =>
        void associateCurrentToken("apns-voip", token, userId, generation);
      tokenListenerCleanup?.();
      voip.addEventListener("register", onRegister);
      tokenListenerCleanup = () => voip.removeEventListener?.("register");
      const cached = currentNativeTokens.get("apns-voip");
      if (cached)
        await associateCurrentToken("apns-voip", cached, userId, generation);
      if (generation === tokenSyncGeneration && currentTokenOwner === userId)
        voip.registerVoipToken();
    } catch {
      /* Ordinary Expo push remains active. */
    }
  }
}
