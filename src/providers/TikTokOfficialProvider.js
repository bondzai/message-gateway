import axios from 'axios';
import { BaseProvider } from './BaseProvider.js';
import { Logger } from '../core/Logger.js';

const MESSAGING_API_BASE = 'https://open.tiktokapis.com/v2/im/message/send/';

export class TikTokOfficialProvider extends BaseProvider {
  constructor(eventBus, config) {
    super(eventBus, config);
    this.accessToken = config.tiktok.accessToken;
    this.verifyToken = config.webhookVerifyToken;
  }

  verifyWebhook(req, res) {
    const token = req.query.verify_token;
    const challenge = req.query.challenge;

    if (token === this.verifyToken && challenge) {
      return res.status(200).send(challenge);
    }

    Logger.warn('Webhook verification failed — token mismatch');
    return res.status(403).json({ error: 'Verification failed' });
  }

  handleWebhook(req, res) {
    const body = req.body;

    if (!body || !body.event) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    if (body.event === 'message') {
      const payload = {
        conversationId: body.conversation_id || body.user?.id || 'unknown',
        user: {
          id: body.user?.id || 'unknown',
          username: body.user?.username || 'unknown',
          nickname: body.user?.nickname || body.user?.username || 'unknown',
          avatar: body.user?.avatar || '',
        },
        message: {
          type: body.message?.type || 'text',
          content: body.message?.content || '',
        },
        timestamp: body.timestamp || new Date().toISOString(),
      };

      this.eventBus.emit('dm:incoming', payload);
    }

    res.status(200).json({ success: true });
  }

  async sendMessage(conversationId, text) {
    if (!this.accessToken) {
      Logger.error('No access token configured — cannot send message');
      return { success: false, error: 'No access token' };
    }

    try {
      const response = await axios.post(
        MESSAGING_API_BASE,
        {
          conversation_id: conversationId,
          message: { type: 'text', content: text },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return { success: true, data: response.data };
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data || err.message;

      if (status === 403 || status === 429) {
        Logger.warn(`Send failed (${status}) — likely outside 48h window or rate limited`);
      } else {
        Logger.error('Send message error:', detail);
      }

      return { success: false, error: detail };
    }
  }
}
