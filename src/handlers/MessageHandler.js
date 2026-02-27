export class MessageHandler {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  register() {
    this.eventBus.on('dm:incoming', (raw) => {
      const normalized = {
        type: 'dm',
        direction: 'incoming',
        accountId: raw.accountId || '',
        conversationId: raw.conversationId,
        timestamp: raw.timestamp || new Date().toISOString(),
        user: {
          id: raw.user?.id || 'unknown',
          username: raw.user?.username || 'unknown',
          nickname: raw.user?.nickname || raw.user?.username || 'unknown',
          avatar: raw.user?.avatar || '',
        },
        message: {
          type: raw.message?.type || 'text',
          content: raw.message?.content || '',
        },
      };

      this.eventBus.emit('message', normalized);
    });

    return this;
  }
}
