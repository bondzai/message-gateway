import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerAuthRoutes } from '../../src/routes/authRoutes.js';

function createApp(config) {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, config);
  return app;
}

describe('authRoutes', () => {
  it('GET /auth/connect redirects to TikTok with correct params', async () => {
    const app = createApp({
      tiktok: { clientKey: 'test-key', clientSecret: 'test-secret' },
    });

    const res = await request(app).get('/auth/connect');
    expect(res.status).toBe(303);

    const location = res.headers.location;
    expect(location).toContain('tiktok.com/v2/auth/authorize');
    expect(location).toContain('client_key=test-key');
    expect(location).toContain('scope=user.info.basic');
    expect(location).toContain('state=');
    // Web apps do NOT use PKCE (code_challenge) — that's Desktop only
    expect(location).not.toContain('code_challenge');
  });

  it('GET /auth/connect returns 400 when clientKey is missing', async () => {
    const app = createApp({
      tiktok: { clientKey: '', clientSecret: '' },
    });

    const res = await request(app).get('/auth/connect');
    expect(res.status).toBe(400);
  });

  it('GET /auth/callback redirects with error when code is missing', async () => {
    const app = createApp({
      tiktok: { clientKey: 'test-key', clientSecret: 'test-secret' },
    });

    const res = await request(app).get('/auth/callback');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=missing_code');
  });

  it('GET /auth/callback redirects with error when state is expired', async () => {
    const app = createApp({
      tiktok: { clientKey: 'test-key', clientSecret: 'test-secret' },
    });

    const res = await request(app).get('/auth/callback?code=testcode&state=invalid');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=expired_state');
  });
});
