const STORE_KEY = "ep-calendar-user-v1";
const STORE_CACHE = "ep-calendar-user-cache";
const STORE_URL = "/__user-events";
const IDB_NAME = "ep-calendar";
const IDB_STORE = "kv";

let memoryStore = null;

function emptyStore() {
  return { custom: [], overrides: {}, deleted: [], updatedAt: 0 };
}

function normalizeStore(parsed) {
  if (!parsed || typeof parsed !== "object") return emptyStore();
  const custom = Array.isArray(parsed.custom)
    ? parsed.custom.filter((e) => e && e.id && e.date && e.title)
    : [];
  return {
    custom,
    overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
    updatedAt: Number(parsed.updatedAt) || 0,
  };
}

function mergeStores(a, b) {
  const left = normalizeStore(a);
  const right = normalizeStore(b);
  const byId = new Map();
  left.custom.concat(right.custom).forEach((e) => {
    const prev = byId.get(e.id);
    if (!prev || (e.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(e.id, e);
  });
  return {
    custom: Array.from(byId.values()),
    overrides: Object.assign({}, left.overrides, right.overrides),
    deleted: Array.from(new Set(left.deleted.concat(right.deleted))),
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
  };
}

function readLocalStorageStore() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeStore(JSON.parse(raw)) : null;
  } catch (err) {
    return null;
  }
}

function loadStoreSync() {
  if (memoryStore) return memoryStore;
  memoryStore = readLocalStorageStore() || emptyStore();
  return memoryStore;
}

function idbAvailable() {
  return typeof indexedDB !== "undefined";
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  if (!idbAvailable()) return null;
  const db = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(STORE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(store) {
  if (!idbAvailable()) return;
  const db = await idbOpen();
  try {
    await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(store, STORE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function readCacheStore() {
  try {
    const cache = await caches.open(STORE_CACHE);
    const res = await cache.match(STORE_URL);
    if (!res) return null;
    return normalizeStore(await res.json());
  } catch (err) {
    return null;
  }
}

async function hydrateStore() {
  const pieces = [memoryStore, readLocalStorageStore(), await readCacheStore()];
  try {
    const idb = await idbGet();
    if (idb) pieces.push(normalizeStore(idb));
  } catch (err) { /* ignore */ }
  memoryStore = pieces.filter(Boolean).reduce((acc, next) => mergeStores(acc, next), emptyStore());
  return memoryStore;
}

async function persistStore(store) {
  memoryStore = normalizeStore(store);
  memoryStore.updatedAt = Date.now();
  const json = JSON.stringify(memoryStore);

  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORE_KEY, json);
  } catch (err) { /* quota / private */ }

  try {
    await idbSet(memoryStore);
  } catch (err) { /* ignore */ }

  try {
    const cache = await caches.open(STORE_CACHE);
    await cache.put(STORE_URL, new Response(json, {
      headers: { "Content-Type": "application/json" },
    }));
  } catch (err) { /* sw / private mode */ }

  const verified = mergeStores(readLocalStorageStore(), memoryStore);
  const savedIds = new Set((verified.custom || []).map((e) => e.id));
  const missing = (memoryStore.custom || []).some((e) => !savedIds.has(e.id));
  if (missing && typeof localStorage === "undefined") {
    throw new Error("Could not save this task on this device.");
  }
  memoryStore = mergeStores(memoryStore, verified);
  return memoryStore;
}

async function loadStoreAsync() {
  return hydrateStore();
}

function mergedEvents(store) {
  if (!store) store = loadStoreSync();
  const deleted = new Set(store.deleted || []);
  const base = EVENTS.filter((e) => !deleted.has(e.id)).map((e) => {
    const override = store.overrides && store.overrides[e.id];
    return override ? Object.assign({}, e, override, { id: e.id, builtIn: true }) : Object.assign({}, e, { builtIn: true });
  });
  const custom = (store.custom || []).map((e) => Object.assign({}, e, { custom: true }));
  return base.concat(custom);
}
