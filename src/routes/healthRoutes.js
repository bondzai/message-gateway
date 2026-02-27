import { existsSync, readFileSync } from 'fs';

export function registerHealthRoutes(app, { provider, config, chatLogPath }) {
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  // Temporary debug: see channels + contact channel data from Respond.io
  app.get('/api/debug/contacts', async (req, res) => {
    if (!provider.apiUrl) return res.json({ error: 'no provider apiUrl' });
    const axios = (await import('axios')).default;
    const results = {};

    // 1. List workspace channels
    const channelPaths = ['/channel/list', '/channel', '/channels'];
    for (const path of channelPaths) {
      try {
        const r = await axios.get(`${provider.apiUrl}${path}`, { headers: provider.headers });
        results.workspaceChannels = { path, data: r.data };
        break;
      } catch (err) {
        results[`channelErr_${path}`] = err.response?.status || err.message;
      }
    }

    // 2. List contact channels for first contact
    const contacts = Array.from((provider.knownContacts || new Map()).values()).slice(0, 1);
    if (contacts.length > 0) {
      const c = contacts[0];
      const contactPaths = [
        `/contact/id:${c.id}/channel/list`,
        `/contact/${c.id}/channel`,
        `/contact/id:${c.id}/channels`,
      ];
      for (const path of contactPaths) {
        try {
          const r = await axios.get(`${provider.apiUrl}${path}`, { headers: provider.headers });
          results.contactChannels = { path, contactId: c.id, data: r.data };
          break;
        } catch (err) {
          results[`contactChErr_${path}`] = err.response?.status || err.message;
        }
      }
    }

    // 3. Try fetching a message with full details
    if (contacts.length > 0) {
      try {
        const r = await axios.get(
          `${provider.apiUrl}/contact/id:${contacts[0].id}/message/list?limit=1`,
          { headers: provider.headers },
        );
        results.sampleMessage = r.data?.items?.[0] || null;
      } catch (err) {
        results.msgErr = err.response?.status || err.message;
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
