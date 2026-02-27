import { randomBytes } from 'crypto';
import axios from 'axios';
import { generateCodeVerifier, generateCodeChallenge } from '../auth/pkce.js';
import * as pendingOAuth from '../auth/pendingOAuth.js';
import { loadAccounts, saveAccounts } from '../accounts/accountStore.js';
import { Logger } from '../core/Logger.js';

function buildRedirectUri(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/auth/callback`;
}

export function registerAuthRoutes(app, config) {
  app.get('/auth/connect', (req, res) => {
    if (!config.tiktok.clientKey) {
      return res.status(400).send('TIKTOK_CLIENT_KEY not configured in .env');
    }

    const state = randomBytes(16).toString('hex');

    pendingOAuth.set(state, {});

    const redirectUri = buildRedirectUri(req);
    Logger.info(`OAuth redirect_uri: ${redirectUri}`);
    const oauthUrl = 'https://www.tiktok.com/v2/auth/authorize/'
      + `?client_key=${config.tiktok.clientKey}`
      + `&response_type=code`
      + `&scope=user.info.basic`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&state=${state}`;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.redirect(303, oauthUrl);
  });

  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.redirect('/accounts.html?error=missing_code');

    const pending = pendingOAuth.get(state);
    if (!pending) {
      return res.redirect('/accounts.html?error=expired_state');
    }
    pendingOAuth.remove(state);

    const redirectUri = buildRedirectUri(req);

    try {
      const tokenRes = await axios.post(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          client_key: config.tiktok.clientKey,
          client_secret: config.tiktok.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const tokens = tokenRes.data;

      let profile = { open_id: tokens.open_id, display_name: '', avatar_url: '', username: '' };
      try {
        const userRes = await axios.get(
          'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username',
          { headers: { 'Authorization': `Bearer ${tokens.access_token}` } },
        );
        const userData = userRes.data?.data?.user || {};
        profile = {
          open_id: userData.open_id || tokens.open_id,
          display_name: userData.display_name || '',
          avatar_url: userData.avatar_url || '',
          username: userData.username || '',
        };
      } catch (err) {
        Logger.warn(`Could not fetch user profile: ${err.message}`);
      }

      const account = {
        id: profile.open_id,
        open_id: profile.open_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + (tokens.expires_in || 86400) * 1000).toISOString(),
        status: 'active',
        connected_at: new Date().toISOString(),
      };

      const accounts = loadAccounts();
      const existingIdx = accounts.findIndex(a => a.open_id === profile.open_id);

      if (existingIdx >= 0) {
        accounts[existingIdx] = account;
      } else {
        accounts.push(account);
      }

      saveAccounts(accounts);
      Logger.info(`Account connected: @${profile.username || profile.open_id}`);
      res.redirect('/accounts.html?connected=1');
    } catch (err) {
      const detail = err.response?.data || err.message;
      Logger.error('OAuth failed:', detail);
      res.redirect('/accounts.html?error=' + encodeURIComponent(
        typeof detail === 'string' ? detail : JSON.stringify(detail)
      ));
    }
  });
}
