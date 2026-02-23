import { Logger } from '../core/Logger.js';

export class SocketIOTransport {
  constructor(io, eventBus) {
    this.io = io;
    this.eventBus = eventBus;
  }

  register() {
    this.io.on('connection', (socket) => {
      Logger.info(`Client connected: ${socket.id}`);

      socket.on('send_message', (data) => {
        Logger.info(`Outbound message to ${data.conversationId}: ${data.text}`);
        this.eventBus.emit('dm:outgoing', data);
      });

      socket.on('disconnect', () => {
        Logger.info(`Client disconnected: ${socket.id}`);
      });
    });

    this.eventBus.on('message', (data) => {
      this.io.emit('message', data);
    });

    return this;
  }
}
