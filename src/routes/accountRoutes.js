import axios from 'axios';
import { loadAccounts, removeById, toDTO } from '../accounts/accountStore.js';
import { Logger } from '../core/Logger.js';

export function registerAccountRoutes({ app, config }) {
  app.get('/api/accounts', (req, res) => {
    res.json(loadAccounts().map(toDTO));
  });

  app.delete('/api/accounts/:id', async (req, res) => {
    const account = removeById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    try {
      await axios.post(
        'https://open.tiktokapis.com/v2/oauth/revoke/',
        new URLSearchParams({
          client_key: config.tiktok.clientKey,
          client_secret: config.tiktok.clientSecret,
          token: account.access_token,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      Logger.info(`Revoked token for @${account.username || account.open_id}`);
    } catch (err) {
      Logger.warn(`Token revoke failed (may already be invalid): ${err.message}`);
    }

    Logger.info(`Disconnected account: @${account.username || account.open_id}`);
    res.json({ success: true });
  });
}
