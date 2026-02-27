import axios from 'axios';
import { BaseProvider } from './BaseProvider.js';
import { Logger } from '../core/Logger.js';

const API_BASE = 'https://api.respond.io/v2';
const POLL_INTERVAL = 1000;

export class RespondIOProvider extends BaseProvider {
  constructor(eventBus, config) {
    super(eventBus, config);
    this.apiKey = config.thirdParty.apiKey;
    this.apiUrl = config.thirdParty.apiUrl || API_BASE;
    this.knownContacts = new Map();
    this.seenMessageIds = new Set();
    this.channelMap = new Map(); // channelId → channel info (name, source)
    this.contactChannelCache = new Map(); // contactId → channelId
    this.pollTimer = null;
    this._lastErrorStatus = null;
    this._firstPoll = true;
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

    const data = body.data || body;
    const contact = data.contact || {};
    const message = data.message || data.content || {};

    this.eventBus.emit('dm:incoming', {
      conversationId: String(contact.id || data.conversationId || 'unknown'),
      user: {
        id: String(contact.id || 'unknown'),
        username: contact.firstName || 'unknown',
        nickname: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'unknown',
        avatar: contact.profilePic || '',
      },
      message: {
        type: message.type || 'text',
        content: message.text || message.content || '',
      },
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({ success: true });
  }

  async sendMessage(contactId, text) {
    if (!this.apiKey) {
      Logger.error('No Respond.io API token configured');
      return { success: false, error: 'No API token' };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/contact/id:${contactId}/message`,
        { message: { type: 'text', text } },
        { headers: this.headers },
      );

      const msgId = response.data?.messageId;
      // Track the messageId so polling doesn't emit it as a duplicate
      if (msgId) this.seenMessageIds.add(String(msgId));
      return { success: true, data: response.data };
    } catch (err) {
      Logger.error('Send error:', err.response?.data || err.message);
      return { success: false, error: err.response?.data || err.message };
    }
  }

  startPolling() {
    Logger.info(`Polling Respond.io every ${POLL_INTERVAL / 1000}s...`);
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
      // Get all contacts
      const res = await axios.post(
        `${this.apiUrl}/contact/list?limit=50`,
        { search: '', timezone: 'Asia/Bangkok', filter: { '$and': [] } },
        { headers: this.headers },
      );

      const contacts = res.data?.items || [];
      this._lastErrorStatus = null;

      for (const contact of contacts) {
        const id = String(contact.id);

        if (!this.knownContacts.has(id)) {
          this.knownContacts.set(id, contact);
        }

        // Fetch latest messages for this contact
        await this._fetchMessages(contact);
      }

      this._firstPoll = false;
    } catch (err) {
      if (err.response?.status !== this._lastErrorStatus) {
        Logger.warn(`Poll: ${err.response?.data?.message || err.message}`);
        this._lastErrorStatus = err.response?.status;
      }
      if (err.response?.status === 401) {
        Logger.error('Unauthorized — check API token');
        this.stopPolling();
      }
    }
  }

  async _resolveChannelId(contactId) {
    if (this.contactChannelCache.has(String(contactId))) {
      return this.contactChannelCache.get(String(contactId));
    }
    try {
      const res = await axios.get(
        `${this.apiUrl}/contact/id:${contactId}/channels`,
        { headers: this.headers },
      );
      const channels = res.data?.items || [];
      if (channels.length > 0) {
        const ch = channels[0];
        this.contactChannelCache.set(String(contactId), String(ch.id));
        if (!this.channelMap.has(String(ch.id))) {
          this.channelMap.set(String(ch.id), {
            name: ch.name,
            source: ch.source,
          });
        }
        return String(ch.id);
      }
    } catch {
      // skip — will retry next poll
    }
    return '';
  }

  async _fetchMessages(contact) {
    try {
      const id = contact.id;
      const res = await axios.get(
        `${this.apiUrl}/contact/id:${id}/message/list?limit=10`,
        { headers: this.headers },
      );

      const messages = (res.data?.items || []).reverse(); // oldest-first

      // Resolve channel for this contact (cached after first lookup)
      let channelId = '';
      for (const msg of messages) {
        if (msg.channelId) {
          channelId = String(msg.channelId);
          this.contactChannelCache.set(String(id), channelId);
          break;
        }
      }
      if (!channelId) {
        channelId = await this._resolveChannelId(id);
      }

      for (const msg of messages) {
        const msgId = String(msg.messageId);

        if (this.seenMessageIds.has(msgId)) continue;
        this.seenMessageIds.add(msgId);

        const direction = msg.traffic === 'outgoing' ? 'outgoing' : 'incoming';
        const text = msg.message?.text || msg.message?.content || '';

        if (!text) continue;

        this.eventBus.emit(direction === 'incoming' ? 'dm:incoming' : 'message', {
          type: 'dm',
          direction,
          channelId: channelId || String(msg.channelId || ''),
          conversationId: String(id),
          user: direction === 'incoming'
            ? {
                id: String(id),
                username: contact.firstName || String(id),
                nickname: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || String(id),
                avatar: contact.profilePic || '',
              }
            : { id: 'self', username: 'You', nickname: 'You', avatar: '' },
          message: { type: msg.message?.type || 'text', content: text },
          timestamp: msg.messageId
            ? new Date(Math.floor(msg.messageId / 1000)).toISOString()
            : new Date().toISOString(),
        });
      }
    } catch {
      // Silently skip — will retry next poll
    }
  }
}
