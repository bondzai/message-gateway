import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes, createHash } from 'crypto';
import axios from 'axios';

// PKCE helpers for TikTok OAuth
function generateCodeVerifier() {
  return randomBytes(32).toString('base64url');
}
function generateCodeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}
// Temporary store for PKCE verifiers (keyed by state)
const pendingOAuth = new Map();
import config from './src/config.js';
import { EventBus } from './src/core/EventBus.js';
import { Logger } from './src/core/Logger.js';
import { MessageHandler } from './src/handlers/MessageHandler.js';
import { SocketIOTransport } from './src/transport/SocketIOTransport.js';
import { TikTokOfficialProvider } from './src/providers/TikTokOfficialProvider.js';
import { ThirdPartyProvider } from './src/providers/ThirdPartyProvider.js';
import { RespondIOProvider } from './src/providers/RespondIOProvider.js';

const DATA_DIR = join(process.cwd(), 'data');
const CHAT_LOG = join(DATA_DIR, 'chats.jsonl');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
Logger.info(`Chat log path: ${CHAT_LOG}`);

// Accounts store (JSON file for PoC — use DB in production)
function loadAccounts() {
  if (!existsSync(ACCOUNTS_FILE)) return [];
  try { return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8')); } catch { return []; }
}
function saveAccounts(accounts) {
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

app.use(express.json());
app.use(express.static('public'));

// Health check for Render
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Debug endpoint
app.get('/api/status', (req, res) => {
  const p = provider;
  let chatCount = 0;
  try {
    if (existsSync(CHAT_LOG)) {
      chatCount = readFileSync(CHAT_LOG, 'utf-8').trim().split('\n').filter(Boolean).length;
    }
  } catch {}
  res.json({
    provider: config.provider,
    hasApiKey: !!config.thirdParty.apiKey,
    contacts: p.knownContacts ? p.knownContacts.size : 0,
    seenMessages: p.seenMessageIds ? p.seenMessageIds.size : 0,
    polling: !!p.pollTimer,
    chatLogPath: CHAT_LOG,
    chatLogExists: existsSync(CHAT_LOG),
    chatCount,
  });
});

const bus = new EventBus();

// Provider factory
function createProvider() {
  switch (config.provider) {
    case 'respondio': return new RespondIOProvider(bus, config);
    case 'thirdparty': return new ThirdPartyProvider(bus, config);
    default: return new TikTokOfficialProvider(bus, config);
  }
}
const provider = createProvider();

Logger.info(`Using provider: ${config.provider}`);

new MessageHandler(bus).register();
new SocketIOTransport(io, bus).register();

// Save every message to JSONL file
bus.on('message', (msg) => {
  try {
    appendFileSync(CHAT_LOG, JSON.stringify(msg) + '\n');
    Logger.info(`Saved: [${msg.direction}] ${msg.message?.content?.slice(0, 30)}`);
  } catch (err) {
    Logger.error('Failed to save chat:', err.message);
  }
});

// Serve chat log as JSON API
app.get('/api/chats', (req, res) => {
  try {
    if (!existsSync(CHAT_LOG)) return res.json([]);
    const raw = readFileSync(CHAT_LOG, 'utf-8').trim();
    if (!raw) return res.json([]);
    const lines = raw.split('\n').filter(Boolean);
    const chats = lines.map((l) => JSON.parse(l));
    Logger.info(`Serving ${chats.length} saved chats`);
    res.json(chats);
  } catch (err) {
    Logger.error('Failed to read chats:', err.message);
    res.json([]);
  }
});

// Wire outbound DMs to provider
bus.on('dm:outgoing', async ({ conversationId, text }) => {
  const result = await provider.sendMessage(conversationId, text);
  if (result.success) {
    // Emit immediately so it shows on dashboard right away.
    // sendMessage() already added the messageId to seenMessageIds,
    // so polling won't duplicate it.
    bus.emit('message', {
      type: 'dm',
      direction: 'outgoing',
      conversationId,
      timestamp: new Date().toISOString(),
      user: { id: 'self', username: 'You', nickname: 'You', avatar: '' },
      message: { type: 'text', content: text },
    });
  } else {
    Logger.error(`Failed to send to ${conversationId}: ${result.error}`);
  }
});

// ===== Account Management API =====

// List connected accounts
app.get('/api/accounts', (req, res) => {
  const accounts = loadAccounts().map(a => ({
    id: a.id,
    open_id: a.open_id,
    username: a.username,
    display_name: a.display_name,
    avatar_url: a.avatar_url,
    status: a.status,
    token_expires_at: a.token_expires_at,
    connected_at: a.connected_at,
  }));
  res.json(accounts);
});

// Disconnect an account
app.delete('/api/accounts/:id', async (req, res) => {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Account not found' });

  const account = accounts[idx];

  // Revoke token at TikTok
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

  // Remove from accounts
  accounts.splice(idx, 1);
  saveAccounts(accounts);
  Logger.info(`Disconnected account: @${account.username || account.open_id}`);
  res.json({ success: true });
});

// ===== OAuth Connect Flow =====

// Step 1: Redirect to TikTok authorization (with PKCE)
app.get('/auth/connect', (req, res) => {
  if (!config.tiktok.clientKey) {
    return res.status(400).send('TIKTOK_CLIENT_KEY not configured in .env');
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString('hex');

  // Store verifier for callback (expires in 10 min)
  pendingOAuth.set(state, { codeVerifier, createdAt: Date.now() });
  setTimeout(() => pendingOAuth.delete(state), 10 * 60 * 1000);

  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
  const oauthUrl = 'https://www.tiktok.com/v2/auth/authorize/'
    + `?client_key=${config.tiktok.clientKey}`
    + `&response_type=code`
    + `&scope=user.info.basic,im.message.read,im.message.write`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${state}`
    + `&code_challenge=${codeChallenge}`
    + `&code_challenge_method=S256`;

  Logger.info(`Redirecting to TikTok OAuth (PKCE enabled)`);
  res.redirect(oauthUrl);
});

// Step 2: TikTok redirects back with code
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/accounts.html?error=missing_code');

  Logger.info(`OAuth callback received — code: ${code.slice(0, 8)}...`);

  // Retrieve PKCE code_verifier
  const pending = pendingOAuth.get(state);
  if (!pending) {
    Logger.warn('No pending OAuth state found — may have expired');
    return res.redirect('/accounts.html?error=expired_state');
  }
  pendingOAuth.delete(state);

  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;

  try {
    // Step 3: Exchange code for tokens (with code_verifier)
    const tokenRes = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: pending.codeVerifier,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const tokens = tokenRes.data;
    Logger.info(`Token exchange successful — open_id: ${tokens.open_id}`);

    // Step 4: Get user profile info
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
      Logger.info(`Got profile: @${profile.username} (${profile.display_name})`);
    } catch (err) {
      Logger.warn(`Could not fetch user profile: ${err.message}`);
    }

    // Step 5: Save account
    const accounts = loadAccounts();

    // Check if already connected (same open_id)
    const existingIdx = accounts.findIndex(a => a.open_id === profile.open_id);

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

    if (existingIdx >= 0) {
      accounts[existingIdx] = account;
      Logger.info(`Reconnected @${profile.username || profile.open_id}`);
    } else {
      accounts.push(account);
      Logger.info(`Connected new account @${profile.username || profile.open_id}`);
    }

    saveAccounts(accounts);
    res.redirect('/accounts.html?connected=1');

  } catch (err) {
    const detail = err.response?.data || err.message;
    Logger.error('OAuth failed:', detail);
    res.redirect('/accounts.html?error=' + encodeURIComponent(
      typeof detail === 'string' ? detail : JSON.stringify(detail)
    ));
  }
});

// Webhook routes
app.get('/webhook/tiktok', (req, res) => provider.verifyWebhook(req, res));
app.post('/webhook/tiktok', (req, res) => provider.handleWebhook(req, res));

server.listen(config.port, '0.0.0.0', () => {
  Logger.info(`Server running on http://localhost:${config.port}`);
  Logger.info('Webhook URL: /webhook/tiktok');
  Logger.info('OAuth callback: /auth/callback');

  // Start polling if using Respond.io provider
  if (provider.startPolling) {
    provider.startPolling();
  }

  // Show OAuth start URL if client key is configured
  if (config.provider === 'official' && config.tiktok.clientKey) {
    Logger.info('');
    Logger.info('=== To start OAuth, open this URL in your browser: ===');
    Logger.info(`https://www.tiktok.com/v2/auth/authorize/?client_key=${config.tiktok.clientKey}&response_type=code&scope=user.info.basic,im.message.read,im.message.write&redirect_uri=http://localhost:${config.port}/auth/callback&state=poc`);
    Logger.info('');
  }
});

process.on('SIGINT', () => {
  Logger.info('Shutting down...');
  if (provider.stopPolling) provider.stopPolling();
  io.close();
  server.close(() => {
    Logger.info('Server closed');
    process.exit(0);
  });
});
