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
      res.json(lines.map((l) => JSON.parse(l)));
    } catch (err) {
      Logger.error('Failed to read chats:', err.message);
      res.json([]);
    }
  });
}
