import { appendFileSync, existsSync, readFileSync } from 'fs';
import { Logger } from '../core/Logger.js';

export function registerChatRoutes(app, bus, { chatLogPath }) {
  bus.on('message', (msg) => {
    try {
      appendFileSync(chatLogPath, JSON.stringify(msg) + '\n');
    } catch (err) {
      Logger.error('Failed to save chat:', err.message);
    }
  });

  app.get('/api/chats', (req, res) => {
    try {
      if (!existsSync(chatLogPath)) return res.json([]);
      const raw = readFileSync(chatLogPath, 'utf-8').trim();
      if (!raw) return res.json([]);
      const lines = raw.split('\n').filter(Boolean);
      let chats = lines.map((l) => JSON.parse(l));

      const { accountId, channelId } = req.query;
      if (channelId) {
        chats = chats.filter((c) => c.channelId === channelId || !c.channelId);
      } else if (accountId) {
        chats = chats.filter((c) => c.accountId === accountId || !c.accountId);
      }

      res.json(chats);
    } catch (err) {
      Logger.error('Failed to read chats:', err.message);
      res.json([]);
    }
  });
}
