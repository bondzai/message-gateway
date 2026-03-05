import { EVENTS } from '../core/constants.js';

export class SocketIOTransport {
  constructor(io, eventBus) {
    this.io = io;
    this.eventBus = eventBus;
  }

  register() {
    this.io.on('connection', (socket) => {
      socket.on('send_message', (data) => {
        this.eventBus.emit(EVENTS.DM_OUTGOING, data);
      });
    });

    this.eventBus.on(EVENTS.MESSAGE, (data) => {
      this.io.emit(EVENTS.MESSAGE, data);
    });

    return this;
  }
}
