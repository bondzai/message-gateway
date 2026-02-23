import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import axios from 'axios';
import config from './src/config.js';
import { EventBus } from './src/core/EventBus.js';
import { Logger } from './src/core/Logger.js';
import { MessageHandler } from './src/handlers/MessageHandler.js';
import { SocketIOTransport } from './src/transport/SocketIOTransport.js';
import { TikTokOfficialProvider } from './src/providers/TikTokOfficialProvider.js';
import { ThirdPartyProvider } from './src/providers/ThirdPartyProvider.js';
import { RespondIOProvider } from './src/providers/RespondIOProvider.js';

const CHAT_LOG = new URL('./data/chats.jsonl', import.meta.url).pathname;
const DATA_DIR = new URL('./data', import.meta.url).pathname;
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

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
  } catch (err) {
    Logger.error('Failed to save chat:', err.message);
  }
});

// Serve chat log as JSON API
app.get('/api/chats', (req, res) => {
  if (!existsSync(CHAT_LOG)) return res.json([]);
  const lines = readFileSync(CHAT_LOG, 'utf-8').trim().split('\n').filter(Boolean);
  res.json(lines.map((l) => JSON.parse(l)));
});

// Wire outbound DMs to provider
// Note: we don't emit 'message' here — polling will pick up the outgoing
// message from the API and emit it, avoiding duplicates.
bus.on('dm:outgoing', async ({ conversationId, text }) => {
  const result = await provider.sendMessage(conversationId, text);
  if (!result.success) {
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
