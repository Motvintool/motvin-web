import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasLocalTools } from './localTools';

/** The computer-only admin tools: offered on the admin's own machine, never on motvin.com. */

const at = (hostname: string) => vi.stubGlobal('window', { location: { hostname } });

describe('hasLocalTools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is on in development, wherever the page is opened', () => {
    vi.stubEnv('NODE_ENV', 'development');
    at('motvin.com');
    expect(hasLocalTools()).toBe(true);
  });

  it('is off on the live site and on for a local production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    at('motvin.com');
    expect(hasLocalTools()).toBe(false);
    at('www.motvin.com');
    expect(hasLocalTools()).toBe(false);
    at('localhost');
    expect(hasLocalTools()).toBe(true);
    at('127.0.0.1');
    expect(hasLocalTools()).toBe(true);
  });

  it('is off on the server of a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(hasLocalTools()).toBe(false);
  });
});
