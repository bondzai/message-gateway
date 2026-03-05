const EXPIRY_MS = 10 * 60 * 1000;
const store = new Map();

export function set(state, data) {
  store.set(state, { ...data, createdAt: Date.now() });
}

export function get(state) {
  const entry = store.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > EXPIRY_MS) {
    store.delete(state);
    return null;
  }
  return entry;
}

export function remove(state) {
  store.delete(state);
}

export function cleanup() {
  const now = Date.now();
  for (const [state, entry] of store) {
    if (now - entry.createdAt > EXPIRY_MS) store.delete(state);
  }
}
