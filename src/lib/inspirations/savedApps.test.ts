import { describe, expect, it } from 'vitest';
import { inSection, itemPlatforms, readSavedAppId, savedAppId } from './savedApps';

describe('saved app ids', () => {
  it('keeps an app on one platform under its own id', () => {
    expect(savedAppId('lensa', 'ios', false)).toBe('lensa');
    expect(readSavedAppId('lensa')).toEqual({ appId: 'lensa', platform: null });
  });

  it('saves an app on several platforms per platform, apart', () => {
    expect(savedAppId('claude', 'webapp', true)).toBe('claude@webapp');
    expect(savedAppId('claude', 'ios', true)).toBe('claude@ios');
    expect(readSavedAppId('claude@webapp')).toEqual({ appId: 'claude', platform: 'webapp' });
  });
});

describe('saved items by section', () => {
  const apps = new Map<string, readonly ('ios' | 'webapp' | 'web')[]>([['claude', ['ios', 'webapp']], ['meta-ai-new', ['ios']]]);
  it('reads the platform of every kind of saved item', () => {
    expect(itemPlatforms({ type: 'screen', id: 'claude-webapp-versions-2026-10-27-chats-1' }, apps)).toEqual(['webapp']);
    expect(itemPlatforms({ type: 'flow', id: 'meta-ai-new-ios-versions-2026-10-24-onboarding' }, apps)).toEqual(['ios']);
    expect(itemPlatforms({ type: 'component', id: 'claude-ios-versions-2026-10-26-home-1:button' }, apps)).toEqual(['ios']);
    expect(itemPlatforms({ type: 'app', id: 'claude@webapp' }, apps)).toEqual(['webapp']);
    expect(itemPlatforms({ type: 'app', id: 'claude' }, apps)).toEqual(['ios', 'webapp']);
    expect(itemPlatforms({ type: 'pattern', id: 'login-forms' }, apps)).toBe('any');
  });
  it('keeps each section to its own items', () => {
    expect(inSection({ type: 'screen', id: 'claude-webapp-versions-2026-10-27-chats-1' }, ['ios'], apps)).toBe(false);
    expect(inSection({ type: 'screen', id: 'claude-webapp-versions-2026-10-27-chats-1' }, ['webapp', 'web'], apps)).toBe(true);
    expect(inSection({ type: 'app', id: 'claude@ios' }, ['webapp', 'web'], apps)).toBe(false);
  });
});
