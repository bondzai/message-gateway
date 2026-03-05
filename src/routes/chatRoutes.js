import { appendFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { Logger } from '../core/Logger.js';
import { EVENTS } from '../core/constants.js';
import { getChatLogPath } from '../accounts/accountStore.js';

export function registerChatRoutes({ app, bus, provider }) {
  const chatLogPath = getChatLogPath();

  bus.on(EVENTS.MESSAGE, (msg) => {
    try {
      appendFileSync(chatLogPath, JSON.stringify(msg) + '\n');
    } catch (err) {
      Logger.error('Failed to save chat:', err.message);
    }
  });

  app.get('/api/chats', async (req, res) => {
    try {
      const raw = await readFile(chatLogPath, 'utf-8');
      const trimmed = raw.trim();
      if (!trimmed) return res.json([]);
      let chats = trimmed.split('\n').filter(Boolean).map(l => JSON.parse(l));

      const { accountId } = req.query;
      if (accountId) {
        chats = chats.filter(c => c.accountId === accountId || !c.accountId);
      }

      res.json(chats);
    } catch (err) {
      if (err.code === 'ENOENT') return res.json([]);
      Logger.error('Failed to read chats:', err.message);
      res.json([]);
    }
  });

  app.delete('/api/chats', async (req, res) => {
    try {
      await writeFile(chatLogPath, '');
      if (provider?.seenMessageIds) provider.seenMessageIds.clear();
      Logger.info('Chat history cleared — will re-sync on next poll');
      res.json({ success: true });
    } catch (err) {
      Logger.error('Failed to clear chats:', err.message);
      res.status(500).json({ error: 'Failed to clear chats' });
    }
  });
}
