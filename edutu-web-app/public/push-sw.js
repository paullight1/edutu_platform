/* Edutu Web Push service worker.
 * Registered at scope "/push-sw/" so it coexists with the PWA/Workbox worker
 * at "/". Push events are delivered to whichever worker holds the subscription,
 * so the narrow scope is harmless — it only limits page (fetch) control, which
 * this worker never uses. */

/* API base URL for open telemetry.
 *
 * This file is a plain static asset: there is no build-time env injection and
 * no `import.meta.env` here. `src/lib/webPush.ts` therefore registers the
 * worker as "/push-sw.js?api=<encoded base url>". The browser persists the
 * script URL with the registration, so this value survives the worker being
 * killed and restarted — unlike a postMessage-delivered value, which would be
 * lost on every restart. Falls back to same-origin, which is correct for
 * deployments that proxy the API under the web origin. */
const API_BASE = (() => {
  try {
    return (
      new URL(self.location.href).searchParams.get("api") || self.location.origin
    );
  } catch (e) {
    return "";
  }
})();

/* Records a notification open. Expects backend endpoint:
 *   POST {API_BASE}/notifications/{id}/opened
 * which stamps `opened_at` on the notifications row. The endpoint may not exist
 * yet (404) — the call is fully failure-tolerant and must never block or break
 * the navigation below. Unauthenticated by design: the service worker has no
 * Clerk token, so the backend must accept the opaque notification id alone. */
function recordNotificationOpen(notificationId) {
  if (!API_BASE || !notificationId) return Promise.resolve();
  try {
    return fetch(
      API_BASE.replace(/\/$/, "") +
        "/notifications/" +
        encodeURIComponent(notificationId) +
        "/opened",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openedAt: new Date().toISOString() }),
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      },
    ).catch(() => {});
  } catch (e) {
    return Promise.resolve();
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "Edutu", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Edutu";
  const options = {
    body: payload.body || "",
    data: payload.data || {},
    tag: (payload.data && payload.data.dedupeKey) || payload.kind || undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || "/goals";

  const focusOrOpen = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            client.navigate(target).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
    .catch(() => {});

  /* Telemetry rides inside the same waitUntil chain so the browser keeps the
   * worker alive until the POST settles instead of killing it mid-flight. */
  event.waitUntil(
    Promise.all([focusOrOpen, recordNotificationOpen(data.notificationId)]),
  );
});
