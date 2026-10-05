import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => {
  const apps = [
    { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null },
    { id: 'a2', name: 'Zomato', slug: 'zomato', screenCount: 140, flowCount: 85, logo: null },
    { id: 'a3', name: 'Zoho Corporation', slug: 'zoho', screenCount: 12, flowCount: 3, logo: null },
  ];
  const flows = [
    { id: 'f1', appId: 'a1', name: 'Checkout' },
    { id: 'f2', appId: 'a1', name: 'Onboarding' },
    { id: 'f3', appId: 'a2', name: 'Onboarding' },
  ];
  return {
    inspirationsApi: {
      listApps: vi.fn(async () => apps),
      listFlows: vi.fn(async () => flows),
      listScreens: vi.fn(async () => ({ items: [], total: 7, limit: 24, offset: 0, nextOffset: null })),
      getMeta: vi.fn(async () => ({ taxonomy: { screenTypes: ['splash', 'login'], industries: [] } })),
      listPatterns: vi.fn(async () => [{ name: 'Filter chips', slug: 'filter-chips', category: 'Filters' }]),
      mediaUrl: vi.fn(() => null),
    },
  };
});

import { resolveNavigation } from './navAssistant';

const ask = (text: string, app: Parameters<typeof resolveNavigation>[1] = undefined) => resolveNavigation(text, app);

describe('small talk never navigates', () => {
  it.each(['hi', 'hello', 'hey!', 'thanks', 'who are you', 'how are you', 'help'])('%s', async (text) => {
    const reply = await ask(text);
    expect(reply.go).toBeUndefined();
    expect(reply.text.length).toBeGreaterThan(0);
  });

  it('does not treat "hi" as a letter match inside "Filter chips"', async () => {
    expect((await ask('hi')).go).toBeUndefined();
  });

  it('declines chat it cannot answer, without inventing a page', async () => {
    const reply = await ask('do you know me?');
    expect(reply.go).toBeUndefined();
    expect(reply.text).toMatch(/can’t answer/);
  });
});

describe('pages and names', () => {
  it('opens a page by name', async () => {
    expect((await ask('show flows')).go?.href).toBe('/inspirations/flows');
    expect((await ask('take me to patterns')).go?.href).toBe('/inspirations/patterns');
  });

  it('opens an app by name, inside a sentence, or by its first word', async () => {
    expect((await ask('open swiggy')).go?.href).toBe('/inspirations/app/swiggy');
    expect((await ask('i want swiggy')).go?.href).toBe('/inspirations/app/swiggy');
    expect((await ask('zoho')).go?.href).toBe('/inspirations/app/zoho');
  });

  it('opens a pattern by the start of a word in its name', async () => {
    expect((await ask('filter')).go?.href).toBe('/inspirations/pattern/filter-chips');
  });

  it('opens a screen type page', async () => {
    expect((await ask('login screens')).go?.href).toBe('/inspirations/screens?type=login');
  });
});

describe('an app plus a section or a question', () => {
  it('opens the right tab', async () => {
    expect((await ask('swiggy flows')).go?.href).toBe('/inspirations/app/swiggy?tab=flows');
    expect((await ask('zomato ui elements')).go?.href).toBe('/inspirations/app/zomato?tab=ui-elements');
  });

  it('answers counts from the library', async () => {
    expect((await ask('how much screens have in swiggy')).text).toBe('Swiggy has 262 screens.');
    expect((await ask('how many flows does zomato have')).text).toBe('Zomato has 85 flows.');
    expect((await ask('how many screens and flows in swiggy')).text).toBe('Swiggy has 262 screens and 39 flows.');
  });

  it('answers a count for one screen type in one app', async () => {
    expect((await ask('how many onboarding screens does swiggy have')).text).toBe('Swiggy has 7 onboarding screens.');
  });

  it('answers a count for one screen type in the whole library', async () => {
    expect((await ask('how many login screens are there')).text).toBe('The library has 7 login screens.');
  });

  it('searches an app’s screens of one type', async () => {
    expect((await ask('show me swiggy splash screen')).go?.href).toBe('/inspirations/search?q=Swiggy%20splash');
  });

  it('compares two apps without navigating', async () => {
    const reply = await ask('compare swiggy and zomato');
    expect(reply.go).toBeUndefined();
    expect(reply.text).toContain('Swiggy has 262 screens and 39 flows.');
    expect(reply.text).toContain('Zomato has 140 screens and 85 flows.');
  });

  it('asks which app when two are named without a comparison', async () => {
    const reply = await ask('swiggy zomato');
    expect(reply.go).toBeUndefined();
    expect(reply.targets).toHaveLength(2);
  });
});

describe('flows by name', () => {
  it('opens one flow when the app narrows it to one', async () => {
    expect((await ask('show swiggy checkout flow')).go?.href).toBe('/inspirations/flows?flow=f1');
  });

  it('offers the choices when several apps have one', async () => {
    const reply = await ask('onboarding flow');
    expect(reply.go).toBeUndefined();
    expect(reply.targets).toHaveLength(3 - 1);
  });
});

describe('remembering the last app', () => {
  it('reads "it" as the app from the last answer', async () => {
    const first = await ask('open swiggy');
    expect(first.app?.name).toBe('Swiggy');
    expect((await ask('how many flows does it have', { app: first.app ?? null })).text).toBe('Swiggy has 39 flows.');
    expect((await ask('show its flows', { app: first.app ?? null })).go?.href).toBe('/inspirations/app/swiggy?tab=flows');
  });

  it('does not read "there" as the last app', async () => {
    const swiggy = (await ask('open swiggy')).app ?? null;
    expect((await ask('how many login screens are there', { app: swiggy })).text).toBe('The library has 7 login screens.');
  });

  it('forgets nothing it should not: a comparison leaves no app to refer back to', async () => {
    expect((await ask('compare swiggy and zomato')).app).toBeUndefined();
  });

  it('does not invent an app when nothing was said before', async () => {
    expect((await ask('how many flows does it have', { app: null })).text).not.toMatch(/Swiggy|Zomato/);
  });
});

describe('robustness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignores regex characters and very long input', async () => {
    await expect(ask('swiggy (.*[a-z]+ ' + 'x'.repeat(500))).resolves.toBeDefined();
  });

  it('falls back to a search link for an unknown name', async () => {
    const reply = await ask('blorpfrazzle');
    expect(reply.go).toBeUndefined();
    expect(reply.targets[0].href).toBe('/inspirations/search?q=blorpfrazzle');
  });
});
