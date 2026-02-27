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
    expect(location).toContain('code_challenge_method=S256');
    expect(location).toContain('state=');
    // TikTok requires hex-encoded SHA256 code_challenge (64 hex chars)
    const challenge = new URL(location).searchParams.get('code_challenge');
    expect(challenge).toMatch(/^[0-9a-f]{64}$/);
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
