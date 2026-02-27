import { existsSync, readFileSync } from 'fs';

export function registerHealthRoutes(app, { provider, config, chatLogPath }) {
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/api/mode', (req, res) => res.json({ mode: config.provider }));

  app.get('/api/status', (req, res) => {
    let chatCount = 0;
    try {
      if (existsSync(chatLogPath)) {
        chatCount = readFileSync(chatLogPath, 'utf-8').trim().split('\n').filter(Boolean).length;
      }
    } catch {}
    res.json({
      provider: config.provider,
      hasApiKey: !!config.thirdParty.apiKey,
      contacts: provider.knownContacts ? provider.knownContacts.size : 0,
      seenMessages: provider.seenMessageIds ? provider.seenMessageIds.size : 0,
      polling: !!provider.pollTimer,
      chatLogPath,
      chatLogExists: existsSync(chatLogPath),
      chatCount,
    });
  });
}
