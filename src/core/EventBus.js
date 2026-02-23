export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
    return this;
  }

  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (!listeners) return this;
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
    return this;
  }

  emit(event, ...args) {
    const listeners = this._listeners.get(event);
    if (!listeners) return this;
    for (const cb of listeners) {
      cb(...args);
    }
    return this;
  }
}
