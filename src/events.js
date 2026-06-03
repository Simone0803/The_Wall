export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.listeners.get(type).delete(callback);
  }

  emit(type, payload = {}) {
    const callbacks = this.listeners.get(type);
    if (!callbacks) return;
    for (const callback of callbacks) {
      callback(payload);
    }
  }
}
