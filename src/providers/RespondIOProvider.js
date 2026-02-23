import axios from 'axios';
import { BaseProvider } from './BaseProvider.js';
import { Logger } from '../core/Logger.js';

const API_BASE = 'https://api.respond.io/v2';
const POLL_INTERVAL = 5000;

export class RespondIOProvider extends BaseProvider {
  constructor(eventBus, config) {
    super(eventBus, config);
    this.apiKey = config.thirdParty.apiKey;
    this.apiUrl = config.thirdParty.apiUrl || API_BASE;
    this.seenMessages = new Set();
    this.pollTimer = null;
    this._lastErrorStatus = null;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  verifyWebhook(req, res) {
    res.status(200).send('ok');
  }

  handleWebhook(req, res) {
    const body = req.body;
    if (!body) return res.status(400).json({ error: 'Invalid payload' });

    if (body.event === 'message.created' || body.data) {
      const data = body.data || body;
      const contact = data.contact || {};
      const message = data.message || data.content || {};

      const payload = {
        conversationId: String(contact.id || contact._id || data.conversationId || 'unknown'),
        user: {
          id: String(contact.id || contact._id || 'unknown'),
          username: contact.firstName || contact.phone || contact.email || 'unknown',
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

      this.eventBus.emit('dm:incoming', payload);
    }

    res.status(200).json({ success: true });
  }

  async sendMessage(contactId, text) {
    if (!this.apiKey) {
      Logger.error('No Respond.io API token configured');
      return { success: false, error: 'No API token' };
    }

    try {
      // Respond.io API v2: POST /contact/id:{contactId}/message
      const response = await axios.post(
        `${this.apiUrl}/contact/id:${contactId}/message`,
        { message: { type: 'text', text } },
        { headers: this.headers },
      );

      Logger.info(`Reply sent to contact ${contactId} (msgId: ${response.data?.messageId})`);
      return { success: true, data: response.data };
    } catch (err) {
      Logger.error('Send error:', err.response?.data || err.message);
      return { success: false, error: err.response?.data || err.message };
    }
  }

  startPolling() {
    Logger.info(`Polling Respond.io every ${POLL_INTERVAL / 1000}s for new messages...`);
    this._poll();
    this.pollTimer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async _poll() {
    try {
      // List all contacts with open conversations
      const res = await axios.post(
        `${this.apiUrl}/contact/list?limit=20`,
        { search: '', timezone: 'Asia/Bangkok', filter: { '$and': [] } },
        { headers: this.headers },
      );

      const contacts = res.data?.items || [];
      this._lastErrorStatus = null;

      for (const contact of contacts) {
        await this._checkContact(contact);
      }
    } catch (err) {
      if (err.response?.status !== this._lastErrorStatus) {
        Logger.warn(`Poll error (${err.response?.status || 'network'}): ${err.response?.data?.message || err.message}`);
        this._lastErrorStatus = err.response?.status;
      }
      if (err.response?.status === 401) {
        Logger.error('Unauthorized — stopping polling. Check your API token.');
        this.stopPolling();
      }
    }
  }

  async _checkContact(contact) {
    try {
      const contactId = contact.id;
      if (!contactId) return;

      // Get contact details (includes latest message info)
      const res = await axios.get(
        `${this.apiUrl}/contact/id:${contactId}`,
        { headers: this.headers },
      );

      const c = res.data;

      // Use the contact's last message timestamp as a dedup key
      // Since we can't list messages on Growth plan, we track contact updates
      const key = `${contactId}:${c.created_at}:${c.status}`;
      if (this.seenMessages.has(key)) return;

      // Only emit for new contacts we haven't seen
      if (this.seenMessages.size === 0) {
        // First poll — just mark as seen, don't emit old contacts
        this.seenMessages.add(key);
        Logger.info(`Known contact: ${c.firstName || contactId} (id: ${contactId})`);
        return;
      }

      this.seenMessages.add(key);

      // This is a new contact/conversation we haven't seen before
      const payload = {
        conversationId: String(contactId),
        user: {
          id: String(contactId),
          username: c.firstName || c.phone || c.email || String(contactId),
          nickname: [c.firstName, c.lastName].filter(Boolean).join(' ') || String(contactId),
          avatar: c.profilePic || '',
        },
        message: {
          type: 'text',
          content: '(New conversation started)',
        },
        timestamp: new Date(c.created_at * 1000).toISOString(),
      };

      Logger.info(`New contact detected: ${payload.user.nickname}`);
      this.eventBus.emit('dm:incoming', payload);
    } catch (err) {
      // Skip individual contact errors
    }
  }
}
