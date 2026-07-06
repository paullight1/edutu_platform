/* Edutu Web Push service worker.
 * Registered at scope "/push-sw/" so it coexists with the PWA/Workbox worker
 * at "/". Push events are delivered to whichever worker holds the subscription,
 * so the narrow scope is harmless — it only limits page (fetch) control, which
 * this worker never uses. */

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
  const target = (event.notification.data && event.notification.data.url) || "/goals";

  event.waitUntil(
    self.clients
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
      }),
  );
});
