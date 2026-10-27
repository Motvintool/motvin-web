import { beforeEach, describe, expect, it, vi } from 'vitest';

// Claude is on iOS (117 screens) and the web (33); MakeMyTrip only on iOS. Every answer counts the section's part.
vi.mock('../api', () => {
  const apps = [
    { id: 'claude', name: 'Claude', slug: 'claude', screenCount: 150, flowCount: 49, logo: null, industry: 'ai', rating: null, ratingCount: null, platforms: ['ios', 'webapp'], platformCounts: { ios: { screens: 117, flows: 36 }, webapp: { screens: 33, flows: 13 } } },
    { id: 'makemytrip', name: 'MakeMyTrip', slug: 'makemytrip', screenCount: 231, flowCount: 34, logo: null, industry: 'travel', rating: null, ratingCount: null, platforms: ['ios'], platformCounts: { ios: { screens: 231, flows: 34 } } },
  ];
  const flows = [
    { id: 'f1', appId: 'claude', platform: 'ios', name: 'Onboarding', category: 'onboarding', screenIds: [] },
    { id: 'f2', appId: 'claude', platform: 'webapp', name: 'Logging in', category: 'onboarding', screenIds: [] },
  ];
  return {
    inspirationsApi: {
      listApps: vi.fn(async () => apps),
      listFlows: vi.fn(async () => flows),
      listScreens: vi.fn(async (filters: { platforms: string[] }, _offset?: number, _sort?: string, extra?: { app?: string }) => ({
        items: extra?.app === 'claude' && filters.platforms.includes('webapp') ? [{ id: 'claude-webapp-login-1', appId: 'claude' }, { id: 'claude-webapp-login-2', appId: 'claude' }] : [],
        total: filters.platforms.length ? 5 : 99,
        limit: 24,
        offset: 0,
        nextOffset: null,
      })),
      getMeta: vi.fn(async () => ({ taxonomy: { screenTypes: ['login'], industries: [], flowCategories: ['onboarding'] } })),
      listPatterns: vi.fn(async () => []),
      listElements: vi.fn(async (platforms?: string[]) => [{ kind: 'toast', count: platforms?.length ? 4 : 400 }]),
      mediaUrl: vi.fn(() => null),
    },
  };
});

import { resetIndex } from './guideIndex';
import { resolveNavigation } from './navAssistant';

beforeEach(() => resetIndex());

const onWebs = { app: null, page: { pathname: '/inspirations/apps', search: '?platform=web' } };
const onIos = { app: null, page: { pathname: '/inspirations/apps', search: '' } };

describe('Motvin Buddy keeps to the section', () => {
  it('totals only the section', async () => {
    expect((await resolveNavigation('how many apps are there', onWebs)).text).toBe('The library has 1 app, 33 screens and 13 flows.');
    expect((await resolveNavigation('how many apps are there', onIos)).text).toBe('The library has 2 apps, 348 screens and 70 flows.');
  });

  it('ranks by the section counts', async () => {
    expect((await resolveNavigation('which app has the most screens', onWebs)).text).toBe('Claude has the most screens (33).');
  });

  it('counts a named app on the section', async () => {
    expect((await resolveNavigation('how many screens does claude have', onWebs)).text).toContain('33 screens');
    expect((await resolveNavigation('how many screens does claude have', onWebs)).text).not.toContain('117');
  });

  it('counts screen types and UI elements on the section', async () => {
    expect((await resolveNavigation('how many login screens are there', onWebs)).text).toContain('5 login screens');
    expect((await resolveNavigation('toasts', onWebs)).text).toContain('4 screens');
  });

  it('reads "list ai apps" as apps, not the list element', async () => {
    const reply = await resolveNavigation('list ai apps', onWebs);
    expect(reply.go?.href ?? '').not.toContain('element=list');
  });

  it('copies the web link in Webs', async () => {
    const reply = await resolveNavigation('copy link to claude', onWebs);
    expect(reply.action?.kind === 'copy' && reply.action.href).toContain('platform=webapp');
  });
});

describe('an app from the other section', () => {
  it('opens MakeMyTrip from Webs and says it is on iOS only', async () => {
    const reply = await resolveNavigation('open makemytrip', onWebs);
    expect(reply.text).toBe('MakeMyTrip is only on iOS. Opening it there.');
    expect(reply.go?.href).toBe('/inspirations/app/makemytrip');
  });
});

describe('new questions', () => {
  it('explains Apps and Webs', async () => {
    for (const q of ['what is webs', 'what is the difference between apps and webs', 'apps vs webs']) {
      expect((await resolveNavigation(q, onIos)).text).toContain('Webs is the web');
    }
  });

  it('explains saving', async () => {
    expect((await resolveNavigation('how do i save', onIos)).text).toContain('Collections');
    expect((await resolveNavigation('how do collections work', onIos)).action).toBeUndefined();
  });

  it('opens Settings and Search', async () => {
    expect((await resolveNavigation('open settings', onIos)).go?.href).toBe('/inspirations/settings');
    expect((await resolveNavigation('search page', onIos)).go?.href).toBe('/inspirations/search');
  });

  it('opens the web version of Claude from iOS', async () => {
    expect((await resolveNavigation('show the web version of claude', onIos)).go?.href).toBe('/inspirations/app/claude?platform=webapp');
  });

  it('says when a comparison counts different platforms', async () => {
    const reply = await resolveNavigation('compare claude and makemytrip', onWebs);
    expect(reply.text).toContain('Claude on Web App and MakeMyTrip on iOS');
  });
});

describe('exploring only', () => {
  it('never saves, even screens or flows', async () => {
    for (const q of ['also save claude login screens', 'save the logging in flow of claude', 'save claude']) {
      const reply = await resolveNavigation(q, onWebs);
      expect(reply.action).toBeUndefined();
      expect(reply.text).toContain('I don’t save things');
    }
  });
});

describe('the second round of fixes', () => {
  it('names only the section’s apps in help', async () => {
    const text = (await resolveNavigation('help', onWebs)).text;
    expect(text).toContain('Claude');
    expect(text).not.toMatch(/MakeMyTrip|Swiggy|Zomato/);
  });

  it('lists only the section’s flows', async () => {
    const reply = await resolveNavigation('which apps have onboarding flows', onWebs);
    expect(reply.text).not.toContain('MakeMyTrip');
  });

  it('opens the platform named after the app', async () => {
    expect((await resolveNavigation('open claude ios', onWebs)).go?.href).toBe('/inspirations/app/claude?platform=ios');
  });

  it('reads "list all apps" as apps', async () => {
    expect((await resolveNavigation('list all apps', onIos)).go?.href ?? '').not.toContain('element=list');
  });

  it('understands paywalls and what is new', async () => {
    expect((await resolveNavigation('show me paywalls', onIos)).go?.href).toContain('type=pricing');
    expect((await resolveNavigation('what is new', onIos)).kind).not.toBe('fallback');
  });
});
