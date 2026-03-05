import axios from 'axios';
import { BaseProvider } from './BaseProvider.js';
import { Logger } from '../core/Logger.js';
import { EVENTS, DIRECTION, UNKNOWN, SELF_USER, MAX_SEEN_IDS } from '../core/constants.js';
import { normalizeMessage } from '../core/normalize.js';

const API_BASE = 'https://api.respond.io/v2';
const POLL_INTERVAL = 1000;

export class RespondIOProvider extends BaseProvider {
  constructor(eventBus, config) {
    super(eventBus, config);
    this.apiKey = config.thirdParty.apiKey;
    this.apiUrl = config.thirdParty.apiUrl || API_BASE;
    this.knownContacts = new Map();
    this.seenMessageIds = new Set();
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

    this.eventBus.emit(EVENTS.DM_INCOMING, {
      conversationId: String(contact.id || data.conversationId || UNKNOWN),
      user: {
        id: String(contact.id || UNKNOWN),
        username: contact.firstName || UNKNOWN,
        nickname: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || UNKNOWN,
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

  _pruneSeenIds() {
    if (this.seenMessageIds.size <= MAX_SEEN_IDS) return;
    const ids = [...this.seenMessageIds];
    this.seenMessageIds = new Set(ids.slice(ids.length - MAX_SEEN_IDS / 2));
  }

  async _poll() {
    try {
      const res = await axios.post(
        `${this.apiUrl}/contact/list?limit=50`,
        { search: '', timezone: 'Asia/Bangkok', filter: { '$and': [] } },
        { headers: this.headers },
      );

      const contacts = res.data?.items || [];
      this._lastErrorStatus = null;

      for (const contact of contacts) {
        this.knownContacts.set(String(contact.id), contact);
      }

      await Promise.allSettled(contacts.map(c => this._fetchMessages(c)));
      this._pruneSeenIds();
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

  _buildUser(contact) {
    const id = String(contact.id);
    return {
      id,
      username: contact.firstName || id,
      nickname: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || id,
      avatar: contact.profilePic || '',
    };
  }

  async _fetchMessages(contact) {
    try {
      const id = contact.id;
      const res = await axios.get(
        `${this.apiUrl}/contact/id:${id}/message/list?limit=10`,
        { headers: this.headers },
      );

      const messages = (res.data?.items || []).reverse();

      for (const msg of messages) {
        const msgId = String(msg.messageId);
        if (this.seenMessageIds.has(msgId)) continue;
        this.seenMessageIds.add(msgId);

        const direction = msg.traffic === 'outgoing' ? DIRECTION.OUTGOING : DIRECTION.INCOMING;
        const text = msg.message?.text || msg.message?.content || '';
        if (!text) continue;

        const user = direction === DIRECTION.INCOMING ? this._buildUser(contact) : SELF_USER;
        const timestamp = msg.messageId
          ? new Date(Math.floor(msg.messageId / 1000)).toISOString()
          : new Date().toISOString();

        const event = direction === DIRECTION.INCOMING ? EVENTS.DM_INCOMING : EVENTS.MESSAGE;
        this.eventBus.emit(event, normalizeMessage({
          conversationId: String(id),
          user,
          message: { type: msg.message?.type || 'text', content: text },
          timestamp,
        }, direction));
      }
    } catch (err) {
      Logger.warn(`Fetch messages for contact ${contact.id}: ${err.message}`);
    }
  }
}
