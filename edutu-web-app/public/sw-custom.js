/**
 * Custom service-worker logic imported by the workbox-generated SW
 * (see vite.config.ts workbox.importScripts). Handles:
 *  - notificationclick: focus an existing tab (or open one) at the target URL
 *  - push: render a notification from a server push payload (native/web push
 *    can send here later; today notifications are shown from the page).
 */

function safeNavigationTarget(candidate, fallback) {
  if (typeof candidate !== "string") return fallback;
  try {
    const target = new URL(candidate, self.location.origin);
    if (target.origin !== self.location.origin) return fallback;
    return target.href;
  } catch (err) {
    return fallback;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeNavigationTarget(
    event.notification.data && event.notification.data.url,
    new URL("/dashboard", self.location.origin).href,
  );

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        // Reuse an open Edutu tab when possible.
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch (err) {
              // Cross-origin or unsupported — ignore and keep focus.
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {
      title: "Edutu",
      body: event.data ? event.data.text() : "",
    };
  }

  const title = payload.title || "Edutu";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: payload.tag,
    data: { url: safeNavigationTarget(payload.url, "/dashboard") },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
