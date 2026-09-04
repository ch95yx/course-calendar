const STORE_KEY = "ep-calendar-user-v1";
const STORE_CACHE = "ep-calendar-user-cache";
const STORE_URL = "/__user-events";

function emptyStore() {
  return { custom: [], overrides: {}, deleted: [] };
}

function loadStoreSync() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    return {
      custom: parsed.custom || [],
      overrides: parsed.overrides || {},
      deleted: parsed.deleted || [],
    };
  } catch (err) {
    return emptyStore();
  }
}

async function loadStoreAsync() {
  if (typeof localStorage !== "undefined") return loadStoreSync();
  try {
    const cache = await caches.open(STORE_CACHE);
    const res = await cache.match(STORE_URL);
    if (!res) return emptyStore();
    const parsed = await res.json();
    return {
      custom: parsed.custom || [],
      overrides: parsed.overrides || {},
      deleted: parsed.deleted || [],
    };
  } catch (err) {
    return emptyStore();
  }
}

async function persistStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (err) { /* quota */ }
  try {
    const cache = await caches.open(STORE_CACHE);
    await cache.put(STORE_URL, new Response(JSON.stringify(store), {
      headers: { "Content-Type": "application/json" },
    }));
  } catch (err) { /* sw / private mode */ }
}

function mergedEvents(store) {
  if (!store) store = typeof localStorage !== "undefined" ? loadStoreSync() : emptyStore();
  const deleted = new Set(store.deleted || []);
  const base = EVENTS.filter((e) => !deleted.has(e.id)).map((e) => {
    const override = store.overrides && store.overrides[e.id];
    return override ? Object.assign({}, e, override, { id: e.id, builtIn: true }) : Object.assign({}, e, { builtIn: true });
  });
  const custom = (store.custom || []).map((e) => Object.assign({}, e, { custom: true }));
  return base.concat(custom);
}
