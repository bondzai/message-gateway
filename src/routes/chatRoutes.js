import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
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

      const { accountId } = req.query;
      if (accountId) {
        chats = chats.filter((c) => c.accountId === accountId || !c.accountId);
      }

      res.json(chats);
    } catch (err) {
      Logger.error('Failed to read chats:', err.message);
      res.json([]);
    }
  });

  app.delete('/api/chats', (req, res) => {
    try {
      writeFileSync(chatLogPath, '');
      Logger.info('Chat history cleared');
      res.json({ success: true });
    } catch (err) {
      Logger.error('Failed to clear chats:', err.message);
      res.status(500).json({ error: 'Failed to clear chats' });
    }
  });
}
