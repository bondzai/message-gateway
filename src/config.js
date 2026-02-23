import 'dotenv/config';

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3000,
  provider: process.env.PROVIDER || 'official',
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    accessToken: process.env.TIKTOK_ACCESS_TOKEN || '',
    refreshToken: process.env.TIKTOK_REFRESH_TOKEN || '',
  },
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN || '',
  thirdParty: {
    apiKey: process.env.THIRDPARTY_API_KEY || '',
    apiUrl: process.env.THIRDPARTY_API_URL || '',
  },
});

export default config;
