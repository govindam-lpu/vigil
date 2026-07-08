/*
 * Vigil offline service worker (Phase 4 — outage-safe critical reads).
 *
 * Self-contained (no CDN / external imports) so it satisfies a strict CSP and
 * works fully offline. Behavior:
 *   - Stale-while-revalidate for a small allow-list of critical GET reads
 *     (person profile, active medications, emergency contacts, pinned-document
 *     metadata, recent timeline). Metadata only — document files are never cached.
 *   - An IndexedDB-backed queue captures check-in and record-update POSTs made
 *     while offline and replays them when connectivity returns (Background Sync,
 *     or an "online" message from the page as a fallback).
 *
 * This is minimum-viable offline: tasks, settings, full document files, and full
 * timeline history are intentionally NOT cached.
 */

const CACHE = "vigil-critical-v1";
const DB_NAME = "vigil-offline";
const STORE = "write-queue";

// GET reads cached for offline access (matched by exact pathname; query strings vary).
const CRITICAL_GET = ["/api/persons", "/api/medications", "/api/contacts", "/api/documents", "/api/timeline"];
// POST writes that queue while offline and replay on reconnect.
const QUEUEABLE_POST = ["/api/check-ins", "/api/timeline"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("vigil-critical-") && key !== CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.method === "GET" && CRITICAL_GET.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.method === "POST" && QUEUEABLE_POST.includes(url.pathname)) {
    event.respondWith(postWithQueueFallback(request));
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event_noop(network); // revalidate in the background
    return cached;
  }

  const fresh = await network;
  if (fresh) {
    return fresh;
  }

  return new Response(JSON.stringify({ offline: true }), {
    status: 503,
    headers: { "Content-Type": "application/json" }
  });
}

// Keeps the background revalidation promise alive without awaiting it.
function event_noop(promise) {
  if (promise && typeof promise.then === "function") {
    promise.then(
      () => undefined,
      () => undefined
    );
  }
}

async function postWithQueueFallback(request) {
  try {
    return await fetch(request.clone());
  } catch {
    const body = await request.clone().text();
    await queueWrite({ url: request.url, body, queuedAt: Date.now() });
    try {
      await self.registration.sync.register("vigil-write-sync");
    } catch {
      // Background Sync unsupported — the page posts "vigil-replay" on reconnect instead.
    }
    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueWrite(entry) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readAllWrites() {
  const db = await openDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows;
}

async function deleteWrite(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function replayWrites() {
  const writes = await readAllWrites();
  for (const write of writes) {
    try {
      const response = await fetch(write.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: write.body
      });
      if (response.ok) {
        await deleteWrite(write.id);
      }
    } catch {
      // Still offline — stop and keep the remaining entries for the next sync.
      break;
    }
  }
}

async function clearAll() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("vigil-")).map((key) => caches.delete(key)));
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // ignore
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "vigil-write-sync") {
    event.waitUntil(replayWrites());
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "vigil-replay") {
    event.waitUntil(replayWrites());
  }
  if (event.data === "vigil-clear") {
    event.waitUntil(clearAll());
  }
});
