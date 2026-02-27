import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import config from './src/config.js';
import { EventBus } from './src/core/EventBus.js';
import { Logger } from './src/core/Logger.js';
import { MessageHandler } from './src/handlers/MessageHandler.js';
import { SocketIOTransport } from './src/transport/SocketIOTransport.js';
import { createProvider } from './src/providers/providerFactory.js';
import { ensureDataDir, getChatLogPath } from './src/accounts/accountStore.js';
import { registerHealthRoutes } from './src/routes/healthRoutes.js';
import { registerChatRoutes } from './src/routes/chatRoutes.js';
import { registerAccountRoutes } from './src/routes/accountRoutes.js';
import { registerAuthRoutes } from './src/routes/authRoutes.js';
import { registerWebhookRoutes } from './src/routes/webhookRoutes.js';

ensureDataDir();

const chatLogPath = getChatLogPath();
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static('public', { maxAge: 0 }));

const bus = new EventBus();
const provider = createProvider(bus, config);

new MessageHandler(bus).register();
new SocketIOTransport(io, bus).register();

registerHealthRoutes(app, { provider, config, chatLogPath });
registerChatRoutes(app, bus, { chatLogPath });
registerAccountRoutes(app, config);
registerAuthRoutes(app, config);
registerWebhookRoutes(app, provider);

bus.on('dm:outgoing', async ({ conversationId, text }) => {
  const result = await provider.sendMessage(conversationId, text);
  if (result.success) {
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

server.listen(config.port, '0.0.0.0', () => {
  Logger.info(`Server running on http://localhost:${config.port} [${config.provider}]`);
  if (provider.startPolling) provider.startPolling();
});

process.on('SIGINT', () => {
  if (provider.stopPolling) provider.stopPolling();
  io.close();
  server.close(() => process.exit(0));
});
