export class SocketIOTransport {
  constructor(io, eventBus) {
    this.io = io;
    this.eventBus = eventBus;
  }

  register() {
    this.io.on('connection', (socket) => {
      socket.on('send_message', (data) => {
        this.eventBus.emit('dm:outgoing', data);
      });
    });

    this.eventBus.on('message', (data) => {
      this.io.emit('message', data);
    });

    return this;
  }
}
