import { existsSync, readFileSync } from 'fs';

export function registerHealthRoutes(app, { provider, config, chatLogPath }) {
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  // Temporary debug: see raw contact data + channels from Respond.io
  app.get('/api/debug/contacts', async (req, res) => {
    if (!provider.knownContacts) return res.json([]);
    const axios = (await import('axios')).default;
    const contacts = Array.from(provider.knownContacts.values()).slice(0, 3);
    const results = [];
    for (const c of contacts) {
      try {
        const chRes = await axios.get(
          `${provider.apiUrl}/contact/id:${c.id}/channel`,
          { headers: provider.headers },
        );
        results.push({ contact: c, channels: chRes.data });
      } catch (err) {
        results.push({ contact: c, channelError: err.response?.data || err.message });
      }
    }
    res.json(results);
  });

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
