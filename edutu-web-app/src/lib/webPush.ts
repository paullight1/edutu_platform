import { registerPushToken, unregisterPushToken } from "../services/notifications";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;
const SW_URL = "/push-sw.js";
const SW_SCOPE = "/push-sw/";

export type WebPushState =
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "prompt"
  | "subscribed";

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// VAPID public key (base64url) → Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  return (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? null;
}

async function waitForActive(
  registration: ServiceWorkerRegistration,
): Promise<void> {
  if (registration.active) return;
  const worker = registration.installing || registration.waiting;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    if (worker.state === "activated") return resolve();
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
    });
  });
}

export async function getWebPushState(): Promise<WebPushState> {
  if (!isWebPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";

  const registration = await getPushRegistration();
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;
  if (subscription) return "subscribed";
  return "prompt";
}

/**
 * Requests notification permission, registers the push service worker,
 * subscribes to Web Push, and stores the subscription on the backend.
 * Must be called from a user gesture (permission prompt requirement).
 */
export async function subscribeToWebPush(
  userId: string,
  authToken: string | null,
): Promise<WebPushState> {
  if (!isWebPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "prompt";
  }

  const registration = await navigator.serviceWorker.register(SW_URL, {
    scope: SW_SCOPE,
  });
  await waitForActive(registration);

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  await registerPushToken(
    userId,
    {
      token: subscription.endpoint,
      provider: "webpush",
      device: { subscription: subscription.toJSON() },
    },
    authToken,
  );

  return "subscribed";
}

export async function unsubscribeFromWebPush(
  userId: string,
  authToken: string | null,
): Promise<void> {
  if (!isWebPushSupported()) return;
  const registration = await getPushRegistration();
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;
  if (!subscription) return;

  await unregisterPushToken(userId, subscription.endpoint, authToken).catch(
    () => {},
  );
  await subscription.unsubscribe().catch(() => {});
}
