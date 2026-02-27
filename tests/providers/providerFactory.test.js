import { describe, it, expect } from 'vitest';
import { createProvider } from '../../src/providers/providerFactory.js';
import { EventBus } from '../../src/core/EventBus.js';
import { TikTokOfficialProvider } from '../../src/providers/TikTokOfficialProvider.js';
import { ThirdPartyProvider } from '../../src/providers/ThirdPartyProvider.js';
import { RespondIOProvider } from '../../src/providers/RespondIOProvider.js';

const bus = new EventBus();
const baseConfig = {
  tiktok: { clientKey: '', clientSecret: '', accessToken: '' },
  thirdParty: { apiKey: '', apiUrl: '' },
  webhookVerifyToken: '',
};

describe('providerFactory', () => {
  it('creates RespondIOProvider for "respondio"', () => {
    const provider = createProvider(bus, { ...baseConfig, provider: 'respondio' });
    expect(provider).toBeInstanceOf(RespondIOProvider);
  });

  it('creates ThirdPartyProvider for "thirdparty"', () => {
    const provider = createProvider(bus, { ...baseConfig, provider: 'thirdparty' });
    expect(provider).toBeInstanceOf(ThirdPartyProvider);
  });

  it('defaults to TikTokOfficialProvider for "official"', () => {
    const provider = createProvider(bus, { ...baseConfig, provider: 'official' });
    expect(provider).toBeInstanceOf(TikTokOfficialProvider);
  });

  it('defaults to TikTokOfficialProvider for unknown provider', () => {
    const provider = createProvider(bus, { ...baseConfig, provider: 'unknown' });
    expect(provider).toBeInstanceOf(TikTokOfficialProvider);
  });
});
