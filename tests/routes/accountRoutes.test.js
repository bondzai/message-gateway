import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { registerAccountRoutes } from '../../src/routes/accountRoutes.js';
import { saveAccounts } from '../../src/accounts/accountStore.js';

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'accountRoutes-test-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

function createApp() {
  const app = express();
  app.use(express.json());
  registerAccountRoutes(app, {
    tiktok: { clientKey: 'test', clientSecret: 'test' },
  });
  return app;
}

describe('accountRoutes', () => {
  it('GET /api/accounts returns empty array when no accounts', async () => {
    const app = createApp();
    const res = await request(app).get('/api/accounts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/accounts returns DTOs without tokens', async () => {
    saveAccounts([{
      id: '1', open_id: 'oid1', username: 'user1', display_name: 'User',
      avatar_url: '', status: 'active', token_expires_at: null, connected_at: null,
      access_token: 'secret', refresh_token: 'secret',
    }]);
    const app = createApp();
    const res = await request(app).get('/api/accounts');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty('access_token');
    expect(res.body[0].username).toBe('user1');
  });

  it('DELETE /api/accounts/:id returns 404 for unknown id', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/accounts/nonexistent');
    expect(res.status).toBe(404);
  });
});
