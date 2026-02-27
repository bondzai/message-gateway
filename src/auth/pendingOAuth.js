const EXPIRY_MS = 10 * 60 * 1000;
const store = new Map();

export function set(state, data) {
  store.set(state, { ...data, createdAt: Date.now() });
  setTimeout(() => store.delete(state), EXPIRY_MS);
}

export function get(state) {
  return store.get(state) || null;
}

export function remove(state) {
  store.delete(state);
}
