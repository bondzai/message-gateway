import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
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
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
Logger.info(`Chat log path: ${CHAT_LOG}`);

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

// Webhook routes
app.get('/webhook/tiktok', (req, res) => provider.verifyWebhook(req, res));
app.post('/webhook/tiktok', (req, res) => provider.handleWebhook(req, res));

// OAuth callback — exchanges code for access token automatically
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code parameter');

  Logger.info(`OAuth callback received — code: ${code.slice(0, 8)}...`);

  try {
    const tokenRes = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${req.protocol}://${req.get('host')}/auth/callback`,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const tokens = tokenRes.data;
    Logger.info('OAuth token exchange successful!');
    Logger.info(`Access token: ${tokens.access_token}`);
    Logger.info(`Refresh token: ${tokens.refresh_token}`);
    Logger.info(`Expires in: ${tokens.expires_in}s`);

    // Save tokens to .env file
    const envPath = new URL('./.env', import.meta.url).pathname;
    let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
    envContent = upsertEnv(envContent, 'TIKTOK_ACCESS_TOKEN', tokens.access_token);
    envContent = upsertEnv(envContent, 'TIKTOK_REFRESH_TOKEN', tokens.refresh_token);
    writeFileSync(envPath, envContent);
    Logger.info('Tokens saved to .env — restart server to use them');

    res.send(`
      <h2>TikTok OAuth Success</h2>
      <p>Access token: <code>${tokens.access_token?.slice(0, 20)}...</code></p>
      <p>Refresh token: <code>${tokens.refresh_token?.slice(0, 20)}...</code></p>
      <p>Expires in: ${tokens.expires_in}s</p>
      <p>Tokens saved to .env — <strong>restart the server</strong> to use them.</p>
      <p><a href="/">Go to dashboard</a></p>
    `);
  } catch (err) {
    Logger.error('OAuth token exchange failed:', err.response?.data || err.message);
    res.status(500).send(`
      <h2>OAuth Failed</h2>
      <pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>
    `);
  }
});

// Helper: upsert a key=value in .env content string
function upsertEnv(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  return regex.test(content) ? content.replace(regex, line) : content.trimEnd() + '\n' + line + '\n';
}

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
