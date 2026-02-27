import { TikTokOfficialProvider } from './TikTokOfficialProvider.js';
import { ThirdPartyProvider } from './ThirdPartyProvider.js';
import { RespondIOProvider } from './RespondIOProvider.js';

export function createProvider(bus, config) {
  switch (config.provider) {
    case 'respondio': return new RespondIOProvider(bus, config);
    case 'thirdparty': return new ThirdPartyProvider(bus, config);
    default: return new TikTokOfficialProvider(bus, config);
  }
}
