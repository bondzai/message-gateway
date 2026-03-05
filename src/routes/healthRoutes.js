import { readFile } from 'fs/promises';
import { getChatLogPath } from '../accounts/accountStore.js';

export function registerHealthRoutes({ app, provider, config }) {
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/api/mode', (req, res) => res.json({ mode: config.provider }));

  app.get('/api/status', async (req, res) => {
    let chatCount = 0;
    try {
      const raw = await readFile(getChatLogPath(), 'utf-8');
      chatCount = raw.trim().split('\n').filter(Boolean).length;
    } catch {}
    res.json({
      provider: config.provider,
      contacts: provider.knownContacts?.size || 0,
      seenMessages: provider.seenMessageIds?.size || 0,
      polling: !!provider.pollTimer,
      chatCount,
    });
  });
}
