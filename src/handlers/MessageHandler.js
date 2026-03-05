import { EVENTS } from '../core/constants.js';
import { normalizeMessage } from '../core/normalize.js';

export class MessageHandler {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  register() {
    this.eventBus.on(EVENTS.DM_INCOMING, (raw) => {
      this.eventBus.emit(EVENTS.MESSAGE, normalizeMessage(raw));
    });
    return this;
  }
}
