import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge } from '../../src/auth/pkce.js';

describe('PKCE', () => {
  it('generateCodeVerifier returns 43 chars from TikTok-allowed charset', () => {
    const verifier = generateCodeVerifier();
    expect(typeof verifier).toBe('string');
    expect(verifier.length).toBe(43);
    // TikTok allows: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('generateCodeChallenge returns 64-char hex SHA256 (TikTok format)', () => {
    const challenge = generateCodeChallenge('test-verifier');
    expect(typeof challenge).toBe('string');
    expect(challenge.length).toBe(64);
    expect(challenge).toMatch(/^[0-9a-f]+$/);
  });

  it('same verifier always produces same challenge', () => {
    const v = generateCodeVerifier();
    const c1 = generateCodeChallenge(v);
    const c2 = generateCodeChallenge(v);
    expect(c1).toBe(c2);
  });

  it('different verifiers produce different challenges', () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(generateCodeChallenge(v1)).not.toBe(generateCodeChallenge(v2));
  });
});
