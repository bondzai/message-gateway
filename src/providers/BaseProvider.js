export class BaseProvider {
  constructor(eventBus, config) {
    this.eventBus = eventBus;
    this.config = config;
  }

  verifyWebhook(req, res) {
    throw new Error('verifyWebhook() must be implemented by subclass');
  }

  handleWebhook(req, res) {
    throw new Error('handleWebhook() must be implemented by subclass');
  }

  async sendMessage(conversationId, text) {
    throw new Error('sendMessage() must be implemented by subclass');
  }
}
