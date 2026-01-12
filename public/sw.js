// Service Worker for ICP Proposal Reviewer PWA

const CACHE_NAME = "proposal-reviewer-v1";

// Install event - cache essential assets
self.addEventListener("install", () => {
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener("push", (event) => {
  console.log("[SW] Push received:", event);

  let data = { title: "New Proposal", body: "A new proposal is available" };

  if (event.data) {
    try {
      data = event.data.json();
      console.log("[SW] Push data:", data);
    } catch (e) {
      console.log("[SW] Push data parse error, using text:", e);
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    tag: data.proposalId ? `proposal-${data.proposalId}` : "proposal-notification",
    requireInteraction: true,
    data: {
      url: data.url || (data.proposalId ? `/proposals/${data.proposalId}` : "/"),
      proposalId: data.proposalId,
    },
  };

  console.log("[SW] Showing notification:", data.title, options);

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log("[SW] Notification shown successfully"))
      .catch((err) => console.error("[SW] Failed to show notification:", err))
  );
});

// Notification click event - open the relevant page
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event);
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Open a new window if none found
      return clients.openWindow(url);
    })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip API requests
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
