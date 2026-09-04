const CACHE_NAME = "ep-calendar-v8";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./store.js",
  "./reminders.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

importScripts("./data.js", "./store.js", "./reminders.js");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== NOTIFIED_CACHE && k !== STORE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "deadline-check") {
    event.waitUntil(fireDueReminders(self.registration));
  }
});

self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "check-reminders") {
    event.waitUntil(
      fireDueReminders(self.registration).then((result) => {
        if (event.ports && event.ports[0]) event.ports[0].postMessage(result);
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const date = event.notification.data && event.notification.data.date;
  event.waitUntil((async () => {
    const url = new URL(date ? `./index.html?date=${encodeURIComponent(date)}` : "./", self.registration.scope);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: "open-date", date });
      if (client.focus) await client.focus();
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
