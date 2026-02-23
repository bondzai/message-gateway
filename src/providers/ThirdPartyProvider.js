import axios from 'axios';
import crypto from 'crypto';
import { BaseProvider } from './BaseProvider.js';
import { Logger } from '../core/Logger.js';

export class ThirdPartyProvider extends BaseProvider {
  constructor(eventBus, config) {
    super(eventBus, config);
    this.apiUrl = config.thirdParty.apiUrl || 'https://api.respond.io/v2';
    this.apiKey = config.thirdParty.apiKey;
    this.webhookSecret = config.webhookVerifyToken;
  }

  verifyWebhook(req, res) {
    // Respond.io doesn't use GET verification — just return OK
    res.status(200).send('ok');
  }

  handleWebhook(req, res) {
    const body = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Optional: verify HMAC signature from Respond.io
    const signature = req.headers['x-respond-signature'];
    if (signature && this.webhookSecret) {
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      const digest = hmac.update(JSON.stringify(body)).digest('hex');
      if (signature !== digest) {
        Logger.warn('Webhook signature mismatch — ignoring');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    Logger.info(`Respond.io webhook: ${body.event || 'unknown event'}`);

    // Respond.io "message.created" event payload:
    // { event: "message.created", data: { content: {...}, contact: {...}, ... } }
    if (body.event === 'message.created' || body.data?.message || body.data?.content) {
      const data = body.data || body;
      const contact = data.contact || {};
      const message = data.message || data.content || {};

      const payload = {
        conversationId: data.conversationId || contact.id || String(contact._id) || 'unknown',
        user: {
          id: contact.id || String(contact._id) || 'unknown',
          username: contact.phone || contact.email || contact.name || 'unknown',
          nickname: [contact.firstName, contact.lastName].filter(Boolean).join(' ')
            || contact.name || 'unknown',
          avatar: contact.profilePic || '',
        },
        message: {
          type: message.type || 'text',
          content: message.text || message.content || '',
        },
        timestamp: data.timestamp
          ? new Date(data.timestamp).toISOString()
          : new Date().toISOString(),
      };

      Logger.info(`DM from ${payload.user.nickname}: ${payload.message.content}`);
      this.eventBus.emit('dm:incoming', payload);
    }

    // Must respond 200 within 5 seconds or Respond.io counts an error
    res.status(200).json({ success: true });
  }

  async sendMessage(contactId, text) {
    if (!this.apiKey) {
      Logger.error('No Respond.io API token configured');
      return { success: false, error: 'No API token' };
    }

    try {
      // Respond.io API v2: POST /contact/{contactId}/message
      const response = await axios.post(
        `${this.apiUrl}/contact/${contactId}/message`,
        {
          message: { type: 'text', text },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      Logger.info(`Message sent via Respond.io to contact ${contactId}`);
      return { success: true, data: response.data };
    } catch (err) {
      Logger.error('Respond.io send error:', err.response?.data || err.message);
      return { success: false, error: err.response?.data || err.message };
    }
  }
}
