import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventBus } from '../../src/core/EventBus.js';
import { registerChatRoutes } from '../../src/routes/chatRoutes.js';

describe('chatRoutes', () => {
  let app, bus, tmpDir, chatLogPath;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `chat-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    chatLogPath = join(tmpDir, 'chats.jsonl');

    app = express();
    app.use(express.json());
    bus = new EventBus();
    registerChatRoutes(app, bus, { chatLogPath });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/chats returns empty array when no file', async () => {
    const res = await request(app).get('/api/chats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/chats returns all messages', async () => {
    const msg1 = { conversationId: 'c1', accountId: 'a1', message: { content: 'hi' } };
    const msg2 = { conversationId: 'c2', accountId: 'a2', message: { content: 'hello' } };
    writeFileSync(chatLogPath, JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n');

    const res = await request(app).get('/api/chats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /api/chats?accountId filters by account and includes untagged', async () => {
    const msg1 = { conversationId: 'c1', accountId: 'a1', message: { content: 'hi' } };
    const msg2 = { conversationId: 'c2', accountId: 'a2', message: { content: 'hello' } };
    const msg3 = { conversationId: 'c3', accountId: 'a1', message: { content: 'hey' } };
    const msg4 = { conversationId: 'c4', message: { content: 'untagged' } };
    writeFileSync(chatLogPath, [msg1, msg2, msg3, msg4].map(m => JSON.stringify(m)).join('\n') + '\n');

    const res = await request(app).get('/api/chats?accountId=a1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.every(m => m.accountId === 'a1' || !m.accountId)).toBe(true);
  });

  it('saves messages emitted on the bus', async () => {
    const msg = { conversationId: 'c1', accountId: 'a1', message: { content: 'test' } };
    bus.emit('message', msg);

    const res = await request(app).get('/api/chats');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].conversationId).toBe('c1');
  });
});
