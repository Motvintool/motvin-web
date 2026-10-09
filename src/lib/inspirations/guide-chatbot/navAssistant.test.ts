import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => {
  const apps = [
    { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'webapp'] },
    { id: 'a2', name: 'Zomato', slug: 'zomato', screenCount: 140, flowCount: 85, logo: null, industry: 'food', rating: 4.5, ratingCount: 12, platforms: ['ios', 'web'] },
    { id: 'a3', name: 'Zoho Corporation', slug: 'zoho', screenCount: 12, flowCount: 3, logo: null, industry: 'saas', rating: null, ratingCount: null, platforms: ['web'] },
    { id: 'a4', name: 'Groww', slug: 'groww', screenCount: 90, flowCount: 20, logo: null, industry: 'fintech', rating: 4.2, ratingCount: 3, platforms: ['ios', 'webapp'] },
  ];
  const flows = [
    { id: 'f1', appId: 'a1', name: 'Checkout', category: 'checkout', screenIds: ['s1', 's2', 's3'] },
    { id: 'f2', appId: 'a1', name: 'Onboarding', category: 'onboarding', screenIds: ['s4', 's5'] },
    { id: 'f3', appId: 'a2', name: 'Onboarding', category: 'onboarding', screenIds: ['s6'] },
  ];
  return {
    inspirationsApi: {
      listApps: vi.fn(async () => apps),
      listFlows: vi.fn(async () => flows),
      listScreens: vi.fn(async () => ({ items: [], total: 7, limit: 24, offset: 0, nextOffset: null })),
      getMeta: vi.fn(async () => ({ taxonomy: { screenTypes: ['splash', 'login'], industries: [], flowCategories: ['checkout', 'onboarding'] } })),
      listPatterns: vi.fn(async () => [
        { id: 'p1', name: 'Filter chips', slug: 'filter-chips', category: 'Filters', description: 'Chips that narrow a list.', screenIds: ['swiggy-ios-a', 'zomato-ios-b'] },
        { id: 'p2', name: 'Bottom sheet actions', slug: 'bottom-sheet-actions', category: 'Modals', screenIds: ['zomato-ios-c'] },
      ]),
      listElements: vi.fn(async () => [
        { kind: 'nav-bar', count: 410 },
        { kind: 'bottom-sheet', count: 20 },
        { kind: 'toast', count: 18 },
        { kind: 'search-bar', count: 175 },
      ]),
      mediaUrl: vi.fn(() => null),
    },
  };
});

import { inspirationsApi } from '../api';
import { resetIndex } from './guideIndex';
import { resolveNavigation } from './navAssistant';

// The index stays warm for a minute in the app; tests want every mock change seen at once.
beforeEach(() => resetIndex());

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

  it('offers the choices when several apps have one, plus the page for all of them', async () => {
    const reply = await ask('onboarding flow');
    expect(reply.go).toBeUndefined();
    expect(reply.kind).toBe('clarify');
    expect(reply.targets.map((t) => t.hint)).toEqual(['Flow', 'Flow', 'Flows']);
    expect(reply.targets[2].href).toBe('/inspirations/flows?category=onboarding');
  });
});

describe('remembering the last app', () => {
  it('reads "it" as the app from the last answer', async () => {
    const first = await ask('open swiggy');
    expect(first.app?.name).toBe('Swiggy');
    expect((await ask('how many flows does it have', { app: first.app ?? null })).text).toBe('Swiggy has 39 flows.');
    expect((await ask('show its flows', { app: first.app ?? null })).go?.href).toBe('/inspirations/app/swiggy?tab=flows');
  });

  it('a bare count question is about the app being talked about, and offers the whole library', async () => {
    const swiggy = (await ask('open swiggy')).app ?? null;
    const reply = await ask('how many login screens are there', { app: swiggy });
    expect(reply.text).toBe('Swiggy has 7 login screens.');
    expect(reply.targets[0]).toMatchObject({ label: 'Whole library', ask: 'how many login screens are there in the whole library' });
    expect((await ask(reply.targets[0].ask ?? '', { app: swiggy })).text).toBe('The library has 7 login screens.');
  });

  it('forgets nothing it should not: a comparison leaves no app to refer back to', async () => {
    expect((await ask('compare swiggy and zomato')).app).toBeUndefined();
  });

  it('does not invent an app when nothing was said before', async () => {
    expect((await ask('how many flows does it have', { app: null })).text).not.toMatch(/Swiggy|Zomato/);
  });
});

describe('when the library cannot be reached', () => {
  const fail = () => vi.mocked(inspirationsApi.listApps).mockRejectedValueOnce(new Error('network'));

  it('says so and offers to retry the same question', async () => {
    fail();
    const reply = await ask('how many screens does swiggy have');
    expect(reply.error).toBe(true);
    expect(reply.go).toBeUndefined();
    expect(reply.text).toMatch(/can’t reach the library/);
    expect(reply.targets[0]).toMatchObject({ label: 'Try again', ask: 'how many screens does swiggy have' });
  });

  it('still opens pages, which need no data', async () => {
    expect((await ask('show flows')).go?.href).toBe('/inspirations/flows');
  });

  it('still opens a screen-type page, which needs no data', async () => {
    fail();
    expect((await ask('login screens')).go?.href).toBe('/inspirations/screens?type=login');
  });

  it('does not report an error for small talk', async () => {
    expect((await ask('hello')).error).toBeUndefined();
  });
});

describe('answer cards', () => {
  it('links a count answer’s card to the app', async () => {
    expect((await ask('how many screens does swiggy have')).card?.href).toBe('/inspirations/app/swiggy');
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

describe('forgiving matching', () => {
  it('reads a misspelt app name and says so', async () => {
    const reply = await ask('swigy');
    expect(reply.go?.href).toBe('/inspirations/app/swiggy');
    expect(reply.text).toContain('(I read “swigy” as “Swiggy”.)');
  });

  it('fixes more than one slip in a question', async () => {
    const reply = await ask('how many screns does zomto have');
    expect(reply.text).toContain('Zomato has 140 screens.');
    expect(reply.text).toContain('“screns” as “screens”');
    expect(reply.text).toContain('“zomto” as “Zomato”');
  });

  it('reads a misspelt page name', async () => {
    expect((await ask('show me flwos')).go?.href).toBe('/inspirations/flows');
  });

  it('reads a misspelt screen type', async () => {
    expect((await ask('swiggy onbording screens')).go?.href).toBe('/inspirations/search?q=Swiggy%20onboarding');
  });

  it('leaves an ordinary sentence alone', async () => {
    const reply = await ask('what is the weather today');
    expect(reply.go).toBeUndefined();
    expect(reply.text).not.toMatch(/I read/);
  });

  it('does not mention a correction on an answer that went nowhere', async () => {
    expect((await ask('blorpfrazzle')).text).not.toMatch(/I read/);
  });
});

describe('everyday wording', () => {
  it.each([
    ['sign in screens', '/inspirations/screens?type=login'],
    ['log in screens', '/inspirations/screens?type=login'],
    ['payment screens', '/inspirations/screens?type=checkout'],
    ['welcome screens', '/inspirations/screens?type=onboarding'],
    ['basket screens', '/inspirations/screens?type=cart'],
  ])('%s', async (text, href) => {
    expect((await ask(text)).go?.href).toBe(href);
  });

  it('works inside a question about one app', async () => {
    expect((await ask('register screens for swiggy')).go?.href).toBe('/inspirations/search?q=Swiggy%20sign%20up');
  });
});

describe('apps by industry', () => {
  it('opens the apps of one kind', async () => {
    const reply = await ask('food apps');
    expect(reply.go?.href).toBe('/inspirations/apps?industry=food');
    expect(reply.text).toBe('Showing Food & drink apps.');
    expect(reply.targets.map((t) => t.label)).toEqual(['Swiggy', 'Zomato']);
  });

  it('understands what people call each kind', async () => {
    expect((await ask('banking apps')).go?.href).toBe('/inspirations/apps?industry=fintech');
    expect((await ask('show me fintech apps')).go?.href).toBe('/inspirations/apps?industry=fintech');
  });

  it('counts them from the library', async () => {
    const reply = await ask('how many food apps are there');
    expect(reply.text).toBe('There are 2 Food & drink apps — Swiggy and Zomato.');
    expect(reply.go).toBeUndefined();
    expect(reply.targets[0].href).toBe('/inspirations/apps?industry=food');
  });

  it('says so when there are none', async () => {
    const reply = await ask('healthcare apps');
    expect(reply.text).toBe('There are no Healthcare apps in the library yet.');
    expect(reply.go).toBeUndefined();
  });
});

describe('ranking the apps', () => {
  it('finds the biggest', async () => {
    const reply = await ask('which app has the most screens');
    expect(reply.text).toBe('Swiggy has the most screens (262), followed by Zomato (140).');
    expect(reply.app?.name).toBe('Swiggy');
    expect(reply.targets).toHaveLength(3);
  });

  it('finds the smallest', async () => {
    expect((await ask('which app has the fewest flows')).text).toBe('Zoho Corporation has the fewest flows (3), followed by Groww (20).');
  });

  it('lists the top rated, leaving out unrated apps', async () => {
    expect((await ask('top rated apps')).text).toBe('The top rated apps are Swiggy (5.0), Zomato (4.5) and Groww (4.2).');
  });

  it('can be limited to one kind of app', async () => {
    expect((await ask('which food app has the most flows')).text).toBe('Among Food & drink apps, Zomato has the most flows (85), followed by Swiggy (39).');
  });

  it('keeps the wording natural when the answer is limited to one kind of app', async () => {
    expect((await ask('top rated food apps')).text).toBe('Among Food & drink apps, the top rated apps are Swiggy (5.0) and Zomato (4.5).');
  });

  it('remembers the winner for the next question', async () => {
    const winner = (await ask('which app has the most screens')).app ?? null;
    expect((await ask('how many flows does it have', { app: winner })).text).toBe('Swiggy has 39 flows.');
  });

  it('does not treat a question about screens as a question about apps', async () => {
    const reply = await ask('most popular screens');
    expect(reply.text).not.toMatch(/followed by/);
  });
});

describe('asking which app', () => {
  it('asks when there is nothing for "it" to mean', async () => {
    const reply = await ask('how many flows does it have');
    expect(reply.text).toBe('Which app do you mean?');
    expect(reply.targets[0]).toMatchObject({ label: 'Swiggy', ask: 'how many flows does it have Swiggy' });
    expect(reply.targets).toHaveLength(4);
  });

  it('gets the answer once an option is chosen', async () => {
    const choice = (await ask('show its flows')).targets.find((t) => t.label === 'Zomato');
    expect((await ask(choice?.ask ?? '')).go?.href).toBe('/inspirations/app/zomato?tab=flows');
  });

  it('does not ask when the last app is known', async () => {
    const swiggy = (await ask('open swiggy')).app ?? null;
    expect((await ask('how many flows does it have', { app: swiggy })).text).toBe('Swiggy has 39 flows.');
  });
});

describe('the conversation from the screenshot', () => {
  it('treats "i want app" and "i want apps" the same: name the apps and open the Apps page', async () => {
    for (const text of ['i want app', 'i want apps', 'apps', 'show me apps']) {
      const reply = await ask(text);
      expect(reply.text).toBe('The library has 4 apps — Swiggy, Zomato, Groww and Zoho Corporation. Opening Apps.');
      expect(reply.go?.href).toBe('/inspirations/apps');
      expect(reply.targets.map((t) => t.label)).toEqual(['Swiggy', 'Zomato', 'Groww', 'Zoho Corporation']);
    }
  });

  it('reads "sorry web" as websites', async () => {
    const reply = await ask('sorry web');
    expect(reply.go?.href).toBe('/inspirations/apps?platform=web');
    expect(reply.text).toBe('Showing website apps.');
    expect(reply.targets.map((t) => t.label)).toEqual(['Zomato', 'Zoho Corporation']);
  });

  it('reads "i mean web application" as web apps', async () => {
    const reply = await ask('i mean web application');
    expect(reply.go?.href).toBe('/inspirations/apps?platform=webapp');
    expect(reply.text).toBe('Showing web apps.');
  });
});

describe('where an app runs', () => {
  it.each([
    ['ios apps', '/inspirations/apps?platform=ios'],
    ['iphone apps', '/inspirations/apps?platform=ios'],
    ['webapp', '/inspirations/apps?platform=webapp'],
    ['web apps', '/inspirations/apps?platform=webapp'],
    ['web applications', '/inspirations/apps?platform=webapp'],
    ['websites', '/inspirations/apps?platform=web'],
    ['website apps', '/inspirations/apps?platform=web'],
  ])('%s', async (text, href) => {
    expect((await ask(text)).go?.href).toBe(href);
  });

  it('counts them from the library', async () => {
    expect((await ask('how many web apps are there')).text).toBe('There are 2 web apps — Swiggy and Groww.');
    expect((await ask('how many website apps are there')).text).toBe('There are 2 website apps — Zomato and Zoho Corporation.');
  });

  it('combines with a kind of app', async () => {
    const reply = await ask('food website apps');
    expect(reply.go?.href).toBe('/inspirations/apps?platform=web&industry=food');
    expect(reply.text).toBe('Showing Food & drink website apps.');
    expect(reply.targets.map((t) => t.label)).toEqual(['Zomato']);
  });

  it('can be ranked', async () => {
    expect((await ask('which web app has the most screens')).text).toBe('Among web apps, Swiggy has the most screens (262), followed by Groww (90).');
  });

  it('reads a misspelt platform', async () => {
    expect((await ask('webaps')).go?.href).toBe('/inspirations/apps?platform=webapp');
  });

  it('does not treat the word web in other text as a platform', async () => {
    const reply = await ask('what is a good web design tip');
    expect(reply.go).toBeUndefined();
  });

  it('says so when no app runs there', async () => {
    const reply = await ask('ios healthcare apps');
    expect(reply.text).toBe('There are no Healthcare iOS apps in the library yet.');
    expect(reply.go).toBeUndefined();
  });
});

describe('people correcting themselves', () => {
  it('drops the lead-in', async () => {
    expect((await ask('actually show flows')).go?.href).toBe('/inspirations/flows');
    expect((await ask('sorry i mean swiggy')).go?.href).toBe('/inspirations/app/swiggy');
    expect((await ask('no, zomato flows')).go?.href).toBe('/inspirations/app/zomato?tab=flows');
  });

  it('still answers thanks that begins with ok', async () => {
    const reply = await ask('ok thanks');
    expect(reply.go).toBeUndefined();
    expect(reply.text.length).toBeGreaterThan(0);
  });

  it('answers a bare apology kindly', async () => {
    const reply = await ask('sorry');
    expect(reply.text).toMatch(/No problem/);
    expect(reply.go).toBeUndefined();
  });

  it('keeps a word like ok on its own', async () => {
    expect((await ask('ok')).go).toBeUndefined();
  });
});

describe('the word application', () => {
  it('means app', async () => {
    expect((await ask('which application has the most screens')).text).toBe('Swiggy has the most screens (262), followed by Zomato (140).');
  });
});

describe('the second conversation from the screenshot', () => {
  it('answers a yes/no question about the app it just showed, instead of opening a list', async () => {
    const shown = await ask('navigate to swigy');
    expect(shown.go?.href).toBe('/inspirations/app/swiggy');
    const reply = await ask('is this ios app that you showed to me?', { app: shown.app ?? null });
    expect(reply.text).toBe('Yes — Swiggy is on iOS and Web Apps.');
    expect(reply.go).toBeUndefined();
  });
});

describe('questions about where an app runs', () => {
  const swiggy = { app: { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'webapp'] } as never };
  const zoho = { app: { id: 'a3', name: 'Zoho Corporation', slug: 'zoho', screenCount: 12, flowCount: 3, logo: null, industry: 'saas', rating: null, ratingCount: null, platforms: ['web'] } as never };

  it.each([
    ['is it on ios', 'Yes — Swiggy is on iOS and Web Apps.'],
    ['is it on web apps?', 'Yes — Swiggy is on iOS and Web Apps.'],
    ['is it on web', 'No — Swiggy isn’t on the web. It’s on iOS and Web Apps.'],
    ['is it available on the web?', 'No — Swiggy isn’t on the web. It’s on iOS and Web Apps.'],
    ['what platform is it on', 'Swiggy is on iOS and Web Apps.'],
    ['where does it run', 'Swiggy is on iOS and Web Apps.'],
    ['is it on ios or web apps', 'Swiggy is on iOS and Web Apps.'],
    ['is it a mobile app', 'Yes — Swiggy is on iOS and Web Apps.'],
  ])('%s', async (text, expected) => {
    const reply = await ask(text, swiggy);
    expect(reply.text).toBe(expected);
    expect(reply.go).toBeUndefined();
  });

  it('works with the app named', async () => {
    expect((await ask('is zomato on the web')).text).toBe('Yes — Zomato is on iOS and the web.');
    expect((await ask('what platforms is groww on')).text).toBe('Groww is on iOS and Web Apps.');
    expect((await ask('does swiggy work on web?')).text).toBe('No — Swiggy isn’t on the web. It’s on iOS and Web Apps.');
  });

  it('knows a web-only app is not on mobile', async () => {
    expect((await ask('is it on mobile', zoho)).text).toBe('No — Zoho Corporation isn’t on mobile. It’s on the web.');
  });

  it('still opens the app for a command, when the app is on that platform', async () => {
    const reply = await ask('show swiggy on web apps');
    expect(reply.go?.href).toBe('/inspirations/app/swiggy');
    expect(reply.text).toBe('Swiggy is on iOS and Web Apps.');
  });

  it('does not open the app for a command naming a platform it is not on', async () => {
    const reply = await ask('swiggy on web');
    expect(reply.go).toBeUndefined();
    expect(reply.text).toBe('Swiggy isn’t on the web. It’s on iOS and Web Apps.');
  });

  it('asks which app when nothing has been shown yet', async () => {
    const reply = await ask('is it on ios?');
    expect(reply.text).toBe('Which app do you mean?');
    expect(reply.go).toBeUndefined();
  });
});

describe('questions about what kind of app it is', () => {
  it.each([
    ['is swiggy a food app', 'Yes — Swiggy is a Food & drink app.'],
    ['is swiggy a fintech app?', 'No — Swiggy is a Food & drink app, not Fintech.'],
    ['what kind of app is groww', 'Groww is a Fintech app.'],
    ['which category is zomato in', 'Zomato is a Food & drink app.'],
    ['what type of app is zoho', 'Zoho Corporation is a SaaS app.'],
  ])('%s', async (text, expected) => {
    const reply = await ask(text);
    expect(reply.text).toBe(expected);
    expect(reply.go).toBeUndefined();
  });
});

describe('questions about ratings', () => {
  it('reads the rating off the app', async () => {
    expect((await ask('is swiggy rated')).text).toBe('Swiggy is rated 5.0 out of 5 from 1 rating.');
    expect((await ask("what's zomato's rating")).text).toBe('Zomato is rated 4.5 out of 5 from 12 ratings.');
    expect((await ask('how good is groww?')).text).toBe('Groww is rated 4.2 out of 5 from 3 ratings.');
  });

  it('says when there is none', async () => {
    expect((await ask('is zoho any good')).text).toBe('No one has rated Zoho Corporation yet.');
  });
});

describe('does it have…', () => {
  const swiggy = { app: { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'webapp'] } as never };

  it('answers yes or no with the number, and never navigates', async () => {
    const flows = await ask('does it have flows', swiggy);
    expect(flows.text).toBe('Yes — Swiggy has 39 flows.');
    expect(flows.go).toBeUndefined();
    const login = await ask('does swiggy have a login screen?');
    expect(login.text).toBe('Yes — Swiggy has 7 login screens.');
    expect(login.go).toBeUndefined();
    expect((await ask('does it have screens', swiggy)).text).toBe('Yes — Swiggy has 262 screens.');
  });

  it('a plain request for the same thing still opens it', async () => {
    expect((await ask('swiggy flows')).go?.href).toBe('/inspirations/app/swiggy?tab=flows');
    expect((await ask('show its flows', swiggy)).go?.href).toBe('/inspirations/app/swiggy?tab=flows');
  });
});

describe('tell me about…', () => {
  it('describes the app without opening it', async () => {
    const reply = await ask('tell me about zomato');
    expect(reply.text).toBe('Zomato is a Food & drink app on iOS and the web, with 140 screens and 85 flows.');
    expect(reply.go).toBeUndefined();
    expect(reply.card?.facts).toEqual(['Food & drink', 'iOS · Webs', '140 screens', '85 flows']);
    expect(reply.card?.href).toBe('/inspirations/app/zomato');
  });

  it.each(['what is swiggy', 'what is swiggy?', 'describe groww', 'more about zoho'])('%s', async (text) => {
    const reply = await ask(text);
    expect(reply.go).toBeUndefined();
    expect(reply.card).toBeDefined();
  });

  it('a vague question about an app gets its details rather than its page', async () => {
    const reply = await ask('is swiggy good?');
    expect(reply.go).toBeUndefined();
    expect(reply.text).toMatch(/^Swiggy is rated/);
    const vague = await ask('what about zomato?');
    expect(vague.go).toBeUndefined();
    expect(vague.text).toMatch(/^Zomato is a Food & drink app/);
  });

  it('"how about zomato" still just opens it', async () => {
    expect((await ask('how about zomato')).go?.href).toBe('/inspirations/app/zomato');
  });
});

describe('the whole library', () => {
  it.each(['which apps do you have', 'what apps are there?', 'list all apps', 'all apps'])('%s', async (text) => {
    const reply = await ask(text);
    expect(reply.go?.href).toBe('/inspirations/apps');
  });

  it('names them', async () => {
    expect((await ask('which apps do you have')).text).toBe('The library has 4 apps — Swiggy, Zomato, Groww and Zoho Corporation. Opening Apps.');
  });

  it('reads as a sentence when opening any other page', async () => {
    const reply = await ask('flows');
    expect(reply.text).toMatch(/^(Opening Flows\.|Taking you to Flows\.|Here’s the Flows page\.)$/);
  });

  it('still opens Apps when the library cannot be reached', async () => {
    vi.mocked(inspirationsApi.listApps).mockRejectedValueOnce(new Error('network'));
    const reply = await ask('apps');
    expect(reply.go?.href).toBe('/inspirations/apps');
    expect(reply.error).toBeUndefined();
  });
});

describe('an app whose name sounds like a platform', () => {
  it('is not read as a platform question', async () => {
    vi.mocked(inspirationsApi.listApps).mockResolvedValueOnce([
      { id: 'x1', name: 'Apple Music', slug: 'apple-music', screenCount: 50, flowCount: 5, logo: null, industry: 'entertainment', rating: null, ratingCount: null, platforms: ['ios', 'web'] },
    ] as never);
    const reply = await ask('open apple music');
    expect(reply.go?.href).toBe('/inspirations/app/apple-music');
    expect(reply.text).not.toMatch(/is on/);
  });
});

describe('the third conversation from the screenshot: follow-ups with no pronoun', () => {
  it('"how much screens have?" after opening an app is about that app', async () => {
    const zomato = (await ask('zomato')).app ?? null;
    const reply = await ask('how much screens have?', { app: zomato });
    expect(reply.text).toBe('Zomato has 140 screens.');
    expect(reply.go).toBeUndefined();
    expect(reply.targets[0].label).toBe('Whole library');
  });

  it.each([
    ['how many flows?', 'Swiggy has 39 flows.'],
    ['how many screens and flows', 'Swiggy has 262 screens and 39 flows.'],
    ['on ios?', 'Swiggy is on iOS and Web Apps.'],
    ['what category', 'Swiggy is a Food & drink app.'],
    ['rating?', 'Swiggy is rated 5.0 out of 5 from 1 rating.'],
  ])('%s', async (text, expected) => {
    const swiggy = (await ask('open swiggy')).app ?? null;
    expect((await ask(text, { app: swiggy })).text).toBe(expected);
  });

  it('a screen-type request follows the app too, with a way to see all of them', async () => {
    const swiggy = (await ask('open swiggy')).app ?? null;
    const reply = await ask('login screens', { app: swiggy });
    expect(reply.go?.href).toBe('/inspirations/search?q=Swiggy%20login');
    expect(reply.targets[0]).toMatchObject({ label: 'All login screens', href: '/inspirations/screens?type=login' });
  });

  it('widening words go back to the whole library', async () => {
    const swiggy = (await ask('open swiggy')).app ?? null;
    expect((await ask('how many screens in the whole library', { app: swiggy })).text).toBe('The library has 504 screens, 4 apps and 147 flows.'.replace('504 screens, 4 apps', '4 apps, 504 screens'));
    expect((await ask('how many screens in total', { app: swiggy })).text).toMatch(/^The library has 4 apps/);
  });

  it('questions about other apps are never pulled onto the current one', async () => {
    const swiggy = (await ask('open swiggy')).app ?? null;
    expect((await ask('which app has the most flows', { app: swiggy })).text).toBe('Zomato has the most flows (85), followed by Swiggy (39).');
    expect((await ask('how many food apps are there', { app: swiggy })).text).toBe('There are 2 Food & drink apps — Swiggy and Zomato.');
    expect((await ask('web apps', { app: swiggy })).go?.href).toBe('/inspirations/apps?platform=webapp');
    expect((await ask('compare swiggy and zomato', { app: swiggy })).go).toBeUndefined();
    expect((await ask('flows', { app: swiggy })).go?.href).toBe('/inspirations/flows');
  });

  it('with nothing shown yet, a bare count is the whole library', async () => {
    expect((await ask('how much screens have?')).text).toMatch(/^The library has 4 apps/);
  });
});

/* ------------------------------------------------------------------ */
/* The second engine: states, styles, elements, patterns, categories,  */
/* negation, numbers, ordinals, multi-step, page awareness, actions.    */
/* ------------------------------------------------------------------ */

const ctx = (app: unknown = null, extra: Record<string, unknown> = {}) => ({ app, ...extra }) as Parameters<typeof resolveNavigation>[1];
const SWIGGY = { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'webapp'] };

describe('screens by state and style', () => {
  it.each([
    ['empty states', '/inspirations/screens?state=empty', 'Showing empty screens.'],
    ['show me bottom sheet screens', '/inspirations/screens?state=bottom-sheet', 'Showing bottom sheet screens.'],
    ['dark mode screens', '/inspirations/screens?style=dark', 'Showing dark screens.'],
    ['loading login screens', '/inspirations/screens?type=login&state=loading', 'Showing loading login screens.'],
    ['minimal onboarding screens', '/inspirations/screens?type=onboarding&style=minimal', 'Showing minimal onboarding screens.'],
  ])('%s', async (text, href, answer) => {
    const reply = await ask(text);
    expect(reply.go?.href).toBe(href);
    expect(reply.text).toBe(answer);
  });

  it('counts them', async () => {
    expect((await ask('how many empty states are there')).text).toBe('The library has 7 empty screens.');
  });

  it('scopes to one app, as a page or a yes/no', async () => {
    const show = await ask('swiggy empty states');
    expect(show.go?.href).toBe('/inspirations/search?q=Swiggy%20empty');
    expect(show.text).toBe('Swiggy has 7 empty screens. Showing them.');
    const yes = await ask('does swiggy have error states?');
    expect(yes.text).toBe('Yes — Swiggy has 7 error screens.');
    expect(yes.go).toBeUndefined();
    expect((await ask('how many dark screens does zomato have')).text).toBe('Zomato has 7 dark screens.');
  });
});

describe('UI elements', () => {
  it('opens one kind, with how common it is', async () => {
    const reply = await ask('bottom sheets');
    expect(reply.go?.href).toBe('/inspirations/ui-elements?element=bottom-sheet');
    expect(reply.text).toBe('Showing bottom sheets — 20 screens.');
    expect((await ask('show me nav bars')).go?.href).toBe('/inspirations/ui-elements?element=nav-bar');
    expect((await ask('toasts')).text).toBe('Showing toasts — 18 screens.');
  });

  it('answers which apps and how many', async () => {
    expect((await ask('which apps have toasts')).text).toBe('18 screens have toasts.');
    expect((await ask('how many screens have nav bars')).text).toBe('410 screens have nav bars.');
  });

  it('scopes to one app', async () => {
    const show = await ask('swiggy nav bars');
    expect(show.text).toBe('Swiggy has 7 screens with nav bars.');
    expect(show.go?.href).toBe('/inspirations/app/swiggy?tab=ui-elements');
    const yes = await ask('does zomato have toasts?');
    expect(yes.text).toBe('Yes — Zomato has 7 screens with toasts.');
    expect(yes.go).toBeUndefined();
  });

  it('summarises the most common elements', async () => {
    const reply = await ask('which ui elements are most common');
    expect(reply.text).toBe('The most common UI elements: nav bars (410), search bars (175), bottom sheets (20) and toasts (18).');
    expect(reply.go?.href).toBe('/inspirations/ui-elements');
  });

  it('ignores a kind the library does not have', async () => {
    expect((await ask('carousels')).go?.href ?? '').not.toContain('element=');
  });
});

describe('patterns', () => {
  it('opens a pattern by name, with where it is used', async () => {
    const reply = await ask('filter chips');
    expect(reply.go?.href).toBe('/inspirations/pattern/filter-chips');
    expect(reply.text).toBe('Opening the “Filter chips” pattern.');
    expect(reply.card?.facts).toEqual(['Filters', '2 screens', 'In Swiggy and Zomato']);
  });

  it('says which apps use a pattern', async () => {
    expect((await ask('which apps use filter chips')).text).toBe('The “Filter chips” pattern appears in 2 apps — Swiggy and Zomato.');
    expect((await ask('where are filter chips used')).text).toBe('The “Filter chips” pattern appears in 2 apps — Swiggy and Zomato.');
  });

  it('answers yes/no for one app', async () => {
    expect((await ask('does swiggy use filter chips')).text).toBe('Yes — Swiggy uses the “Filter chips” pattern.');
    expect((await ask('does groww use filter chips')).text).toBe('Groww doesn’t use the “Filter chips” pattern. It appears in Swiggy and Zomato.');
  });

  it('opens a category of patterns', async () => {
    expect((await ask('modal patterns')).go?.href).toBe('/inspirations/pattern/bottom-sheet-actions');
  });

  it('knows "this" on a pattern page', async () => {
    const reply = await ask('which apps use this', ctx(null, { page: { pathname: '/inspirations/pattern/filter-chips' } }));
    expect(reply.text).toBe('The “Filter chips” pattern appears in 2 apps — Swiggy and Zomato.');
  });
});

describe('flows by category', () => {
  it('opens the filtered flows page for the plural', async () => {
    const reply = await ask('onboarding flows');
    expect(reply.go?.href).toBe('/inspirations/flows?category=onboarding');
    expect(reply.text).toBe('Showing 2 onboarding flows.');
  });

  it('says which apps have one', async () => {
    expect((await ask('which apps have an onboarding flow')).text).toBe('There are 2 onboarding flows, in Swiggy and Zomato.');
  });

  it('opens the one flow of that kind inside an app', async () => {
    const reply = await ask('swiggy checkout flow');
    expect(reply.go?.href).toBe('/inspirations/flows?flow=f1');
    expect(reply.text).toBe('Opening Swiggy’s checkout flow, “Checkout”.');
    expect(reply.card?.facts).toEqual(['Swiggy', 'Checkout', '3 steps']);
  });

  it('reads everyday words for a category', async () => {
    expect((await ask('payment flow in swiggy')).go?.href).toBe('/inspirations/flows?flow=f1');
    expect((await ask('sign up flows')).text).toBe('No authentication flows yet.');
  });
});

describe('negation', () => {
  it('lists everything but', async () => {
    const reply = await ask('apps except swiggy');
    expect(reply.text).toBe('Apart from Swiggy: Zomato, Groww and Zoho Corporation.');
    expect(reply.results?.map((t) => t.label)).toEqual(['Zomato', 'Groww', 'Zoho Corporation']);
    expect(reply.go).toBeUndefined();
  });

  it('combines with a kind of app', async () => {
    const reply = await ask('websites other than zomato');
    expect(reply.text).toBe('Showing website apps (leaving out Zomato).');
    expect(reply.targets.map((t) => t.label)).toEqual(['Zoho Corporation']);
  });

  it('reads a correction', async () => {
    expect((await ask('not swiggy, zomato')).go?.href).toBe('/inspirations/app/zomato');
  });

  it('rules out a platform', async () => {
    const reply = await ask('apps that are not on web');
    expect(reply.targets.map((t) => t.label).sort()).toEqual(['Groww', 'Swiggy']);
  });
});

describe('numbers', () => {
  it('filters apps by a count', async () => {
    expect((await ask('apps with more than 100 screens')).text).toBe('2 apps have more than 100 screens: Swiggy (262) and Zomato (140).');
    expect((await ask('which apps have fewer than 20 flows')).text).toBe('1 app has fewer than 20 flows: Zoho Corporation (3).');
    expect((await ask('apps with at least 4.5 stars')).text).toBe('2 apps have at least 4.5 stars: Swiggy (5.0) and Zomato (4.5).');
  });

  it('says when none match', async () => {
    const reply = await ask('apps with more than 1000 screens');
    expect(reply.text).toBe('No apps have more than 1000 screens.');
    expect(reply.go).toBeUndefined();
  });

  it('ranks inside a filter', async () => {
    expect((await ask('which app with more than 100 screens has the most flows')).text).toBe('Among apps with more than 100 screens, Zomato has the most flows (85), followed by Swiggy (39).');
  });

  it('gives a top n', async () => {
    expect((await ask('top 3 apps by screens')).text).toBe('The top 3 by screens: Swiggy (262), Zomato (140) and Groww (90).');
    expect((await ask('top 2 rated apps')).text).toBe('The top rated apps are Swiggy (5.0) and Zomato (4.5).');
  });

  it('handles newest when no dates are recorded', async () => {
    expect((await ask('newest app')).text).toBe('No capture dates have been recorded yet.');
  });
});

describe('picking from what was listed', () => {
  it('"the second one", "both", "all of them", "the other one"', async () => {
    const ranked = await ask('which app has the most screens');
    const results = ranked.results;
    expect(results?.map((t) => t.label)).toEqual(['Swiggy', 'Zomato', 'Groww', 'Zoho Corporation']);
    expect((await ask('the second one', ctx(ranked.app, { results }))).go?.href).toBe('/inspirations/app/zomato');
    expect((await ask('open the last one', ctx(ranked.app, { results }))).go?.href).toBe('/inspirations/app/zoho');
    const both = await ask('both', ctx(ranked.app, { results }));
    expect(both.card?.columns).toEqual(['Swiggy', 'Zomato']);
    expect(both.card?.rows?.[0]).toEqual({ label: 'Screens', values: ['262', '140'] });
    expect((await ask('all of them', ctx(ranked.app, { results }))).text).toBe('Here they all are — Swiggy, Zomato, Groww and Zoho Corporation.');
    const compared = await ask('compare swiggy and zomato');
    expect((await ask('the other one', ctx(SWIGGY, { results: compared.results }))).go?.href).toBe('/inspirations/app/zomato');
  });

  it('is honest when the list is shorter than asked', async () => {
    const compared = await ask('compare swiggy and zomato');
    const reply = await ask('the fourth one', ctx(null, { results: compared.results }));
    expect(reply.text).toBe('I only listed 2 apps — Swiggy and Zomato. Which one?');
  });

  it('does nothing special without a list', async () => {
    expect((await ask('the second one')).go).toBeUndefined();
  });
});

describe('two requests in one', () => {
  it('runs them in order, carrying the app forward', async () => {
    const reply = await ask('open zomato and show its flows');
    expect(reply.go?.href).toBe('/inspirations/app/zomato?tab=flows');
    expect(reply.text).toMatch(/Zomato\./);
    expect(reply.text).toMatch(/Zomato’s flows\./);
  });

  it('answers a question after an open', async () => {
    const reply = await ask('open swiggy, then how many flows does it have');
    expect(reply.text).toMatch(/Swiggy has 39 flows\.$/);
  });
});

describe('knowing the page', () => {
  it('uses the app page as the subject', async () => {
    const page = { pathname: '/inspirations/app/zomato' };
    expect((await ask('how many screens?', ctx(null, { page }))).text).toBe('Zomato has 140 screens.');
    expect((await ask('is it on web', ctx(null, { page }))).text).toBe('Yes — Zomato is on iOS and the web.');
  });

  it('answers "which app is this"', async () => {
    const reply = await ask('which app is this', ctx(null, { page: { pathname: '/inspirations/app/zomato' } }));
    expect(reply.text).toBe('You’re looking at Zomato. Zomato is a Food & drink app on iOS and the web, with 140 screens and 85 flows.');
    expect(reply.go).toBeUndefined();
    expect((await ask('where am i', ctx(null, { page: { pathname: '/inspirations/flows' } }))).text).toBe('You’re on the Flows page.');
  });
});

describe('not over-reaching', () => {
  const onZomato = ctx(null, { page: { pathname: '/inspirations/app/zomato' } });

  it('"what is this" is about the app on the page, but a real question is not', async () => {
    expect((await ask('what is this', onZomato)).text).toMatch(/^Zomato is a Food & drink app/);
    expect((await ask('tell me about it', onZomato)).text).toMatch(/^Zomato is a Food & drink app/);
    const life = await ask('what is the meaning of life', onZomato);
    expect(life.kind).toBe('fallback');
    expect(life.text).not.toMatch(/Zomato/);
    expect((await ask('what is a design system?', ctx(SWIGGY))).kind).toBe('fallback');
  });
});

describe('small safe actions', () => {
  it('offers to save an app', async () => {
    const reply = await ask('save swiggy');
    expect(reply.action).toEqual({ kind: 'save', item: { type: 'app', id: 'a1' }, label: 'Swiggy' });
    expect(reply.text).toBe('Save Swiggy to a collection?');
    expect(reply.kind).toBe('action');
    expect(reply.go).toBeUndefined();
  });

  it('offers to copy a link', async () => {
    const reply = await ask('copy link to zomato');
    expect(reply.action).toEqual({ kind: 'copy', href: '/inspirations/app/zomato', label: 'Zomato' });
  });

  it('uses the current app or page', async () => {
    expect((await ask('save it', ctx(SWIGGY))).action?.kind).toBe('save');
    expect((await ask('save this', ctx(null, { page: { pathname: '/inspirations/pattern/filter-chips' } }))).action).toEqual({ kind: 'save', item: { type: 'pattern', id: 'p1' }, label: 'Filter chips' });
  });

  it('asks when there is nothing to act on', async () => {
    const reply = await ask('save');
    expect(reply.kind).toBe('clarify');
    expect(reply.action).toBeUndefined();
  });
});

describe('similar apps and a surprise', () => {
  it('finds apps of the same kind', async () => {
    expect((await ask('apps like swiggy')).text).toBe('Apps like Swiggy (Food & drink): Zomato.');
    expect((await ask('alternatives to groww')).text).toBe('Groww is the only Fintech app in the library so far.');
  });

  it('picks a random app', async () => {
    const reply = await ask('surprise me');
    expect(reply.go?.href).toMatch(/^\/inspirations\/app\//);
    expect(reply.text).toMatch(/^How about /);
  });
});

describe('every reply says what kind it is', () => {
  it.each([
    ['hi', 'smalltalk'],
    ['open swiggy', 'nav'],
    ['how many screens does swiggy have', 'answer'],
    ['how many flows does it have', 'clarify'],
    ['blorpfrazzle', 'fallback'],
    ['save swiggy', 'action'],
  ])('%s → %s', async (text, kind) => {
    expect((await ask(text)).kind).toBe(kind);
  });

  it('error', async () => {
    vi.mocked(inspirationsApi.listApps).mockRejectedValueOnce(new Error('offline'));
    expect((await ask('how many screens does swiggy have')).kind).toBe('error');
  });
});

/* ------------------------------------------------------------------ */
/* Round three: what failed against messy, unseen phrasing.            */
/* ------------------------------------------------------------------ */

describe('manners', () => {
  it.each(['thank you so much!', 'thanks a lot', 'thanks again', 'cheers', 'perfect, thanks', 'ok bye', 'bye', 'see you later', 'thanks, bye'])('%s', async (text) => {
    const reply = await ask(text);
    expect(reply.kind).toBe('smalltalk');
    expect(reply.go).toBeUndefined();
  });

  it('explains itself when asked what is here', async () => {
    for (const text of ['what can i find here', 'what do you have', 'how can you help', 'how do i use this']) {
      const reply = await ask(text);
      expect(reply.kind, text).toBe('smalltalk');
      expect(reply.text, text).toMatch(/^I take you around Motvin/);
    }
  });
});

describe('saved things', () => {
  it.each(['my collections', 'what did i save', 'what have i saved', 'my bookmarks', 'favorites', 'saved items'])('%s opens Collections', async (text) => {
    expect((await ask(text)).go?.href).toBe('/inspirations/collections');
  });
});

describe('it never changes the library', () => {
  it.each(['delete swiggy', 'remove zomato', 'rename swiggy', 'upload a video', 'how do i add an app', 'can i upload screenshots', 'i want to create a flow'])('%s', async (text) => {
    const reply = await ask(text);
    expect(reply.go, text).toBeUndefined();
    expect(reply.text, text).toMatch(/can’t add, change or delete/);
  });

  it('but "add to cart" is still a screen type', async () => {
    expect((await ask('add to cart screens')).go?.href).toBe('/inspirations/screens?type=cart');
  });

  it('points to the chat history for clearing chats', async () => {
    const reply = await ask('clear my history');
    expect(reply.text).toMatch(/Clear all/);
    expect(reply.go).toBeUndefined();
  });
});

describe('going back and returning', () => {
  it('goes back in the browser', async () => {
    expect((await ask('go back')).go?.href).toBe('__back__');
    expect((await ask('back')).go?.href).toBe('__back__');
  });

  it('reopens the app just talked about', async () => {
    expect((await ask('open the last app again', ctx(SWIGGY))).go?.href).toBe('/inspirations/app/swiggy');
    expect((await ask('back to that one', ctx(SWIGGY))).go?.href).toBe('/inspirations/app/swiggy');
  });

  it('asks which one when there is nothing to reopen', async () => {
    const reply = await ask('open the last app again');
    expect(reply.kind).toBe('clarify');
    expect(reply.targets[0].ask).toBe('open Swiggy');
  });
});

describe('same question, another platform', () => {
  it('answers for the app being talked about', async () => {
    expect((await ask('what about web apps', ctx(SWIGGY))).text).toBe('Yes — Swiggy is on iOS and Web Apps.');
    expect((await ask('and web?', ctx(SWIGGY))).text).toBe('Swiggy isn’t on the web. It’s on iOS and Web Apps.');
    expect((await ask('only ios ones', ctx(SWIGGY))).text).toBe('Yes — Swiggy is on iOS and Web Apps.');
  });

  it('filters what was just listed', async () => {
    const ranked = await ask('which app has the most screens');
    const reply = await ask('what about web', ctx(ranked.app, { results: ranked.results }));
    expect(reply.text).toBe('Of those, Zomato and Zoho Corporation are on the web.');
    expect(reply.results?.map((t) => t.label)).toEqual(['Zomato', 'Zoho Corporation']);
    expect((await ask('and ios?', ctx(ranked.app, { results: [ranked.results![3]] }))).text).not.toMatch(/Of those/);
  });

  it('lists that platform’s apps when there is nothing to refer to', async () => {
    const reply = await ask('and web?');
    expect(reply.go?.href).toBe('/inspirations/apps?platform=web');
  });

  it('is not hijacked by a request for web apps', async () => {
    const ranked = await ask('which app has the most screens');
    expect((await ask('show web apps', ctx(ranked.app, { results: ranked.results }))).go?.href).toBe('/inspirations/apps?platform=webapp');
  });
});

describe('taste, popularity, price: said plainly', () => {
  it('will not pick a favourite', async () => {
    for (const text of ['which one has better onboarding', 'best looking login screens']) {
      const reply = await ask(text);
      expect(reply.text, text).toMatch(/^Which is better is a matter of taste/);
      expect(reply.go, text).toBeUndefined();
    }
    const two = await ask('which is better, swiggy or zomato');
    expect(two.card?.columns).toEqual(['Swiggy', 'Zomato']);
    expect(two.text).toMatch(/matter of taste/);
  });

  it('does not invent popularity', async () => {
    for (const text of ['trending', 'most popular app', 'what is famous here']) expect((await ask(text)).text, text).toMatch(/^I don’t track what’s popular or trending\. By size, Swiggy, Zomato and Groww/);
    expect((await ask('most popular screens')).go?.href).toBe('/inspirations/screens');
  });

  it('does not invent price or users', async () => {
    for (const text of ['free apps', 'which apps are free apps', 'how many users does it have']) expect((await ask(text)).text, text).toMatch(/doesn’t record whether an app is free or paid/);
  });

  it('opens the newest first for "recently added"', async () => {
    expect((await ask('recently added')).go?.href).toBe('/inspirations/screens?sort=newest');
    expect((await ask('newest screens')).go?.href).toBe('/inspirations/screens?sort=newest');
    expect((await ask('latest login screens')).go?.href).toBe('/inspirations/screens?type=login&sort=newest');
    expect((await ask('newest apps')).go?.href).toBe('/inspirations/apps?sort=newest');
    expect((await ask('newest app')).text).toBe('No capture dates have been recorded yet.');
  });
});

describe('definitions never navigate', () => {
  it('explains a pattern from its own description', async () => {
    const reply = await ask('explain filter chips');
    expect(reply.text).toBe('Filter chips: Chips that narrow a list.');
    expect(reply.go).toBeUndefined();
    expect((await ask('what is the filter chips pattern')).go).toBeUndefined();
  });

  it('is honest about a UI element', async () => {
    const reply = await ask('what is a bottom sheet');
    expect(reply.text).toMatch(/^I don’t write definitions, but 20 screens/);
    expect(reply.go).toBeUndefined();
    expect(reply.targets[0].href).toBe('/inspirations/ui-elements?element=bottom-sheet');
  });
});

describe('what a sentence is about', () => {
  it('"screens with search bar" means the component, not the screen type', async () => {
    expect((await ask('screens with search bar')).go?.href).toBe('/inspirations/ui-elements?element=search-bar');
    expect((await ask('search screens')).go?.href).toBe('/inspirations/screens?type=search');
  });

  it('keeps the kind of app and the platform', async () => {
    expect((await ask('empty states from food apps')).go?.href).toBe('/inspirations/screens?state=empty&industry=food');
    expect((await ask('show me how food apps handle login')).go?.href).toBe('/inspirations/screens?type=login&industry=food');
    expect((await ask('ios login screens')).go?.href).toBe('/inspirations/screens?type=login&platform=ios');
    expect((await ask('login screens on web')).go?.href).toBe('/inspirations/screens?type=login&platform=web');
    expect((await ask('show me how food apps handle login')).text).toBe('Showing login screens from Food & drink apps.'.replace('Food & drink', 'food & drink'));
  });

  it('a word it cannot place becomes a search inside the app, not a dropped word', async () => {
    const paywall = await ask('zomato paywall');
    expect(paywall.go?.href).toBe('/inspirations/search?q=Zomato%20paywall');
    expect(paywall.text).toBe('Searching Zomato for “paywall”.');
    expect((await ask('swiggy restaurants')).go?.href).toBe('/inspirations/search?q=Swiggy%20restaurants');
  });

  it('but filler never becomes a search', async () => {
    for (const text of ['swiggy pls', 'open zomato please', 'show me everything about groww', 'take me to swiggy now']) {
      expect((await ask(text)).go?.href, text).toMatch(/^\/inspirations\/app\/(swiggy|zomato|groww)$/);
    }
  });

  it('answers for every app named', async () => {
    expect((await ask('swiggy and zomato flows')).text).toBe('Swiggy has 39 flows. Zomato has 85 flows.');
    expect((await ask('how many screens do swiggy and zomato have')).text).toBe('Swiggy has 262 screens. Zomato has 140 screens.');
    expect((await ask('swiggy and zomato flows')).go).toBeUndefined();
  });

  it('compares all apps by taking the biggest three', async () => {
    const reply = await ask('compare all apps');
    expect(reply.card?.columns).toEqual(['Swiggy', 'Zomato', 'Groww']);
    expect(reply.text).toMatch(/^The 3 biggest of 4 apps, side by side\./);
  });
});

describe('round four: the next batch of unseen phrasing', () => {
  it('reads a possessive: "swiggys flows"', async () => {
    expect((await ask('i wanna see swiggys flows')).go?.href).toBe('/inspirations/app/swiggy?tab=flows');
    expect((await ask('zomatos ui elements')).go?.href).toBe('/inspirations/app/zomato?tab=ui-elements');
  });

  it('ranks apps without being told the word "app"', async () => {
    expect((await ask('least flows')).text).toBe('Zoho Corporation has the fewest flows (3), followed by Groww (20).');
    expect((await ask('which has the most screens')).text).toBe('Swiggy has the most screens (262), followed by Zomato (140).');
    expect((await ask('highest rated')).text).toMatch(/^The top rated apps are Swiggy \(5\.0\)/);
  });

  it('but "best login screens" is still about screens', async () => {
    expect((await ask('best login screens')).go?.href).toBe('/inspirations/screens?type=login');
  });

  it('"details" and "info" at the end ask about the app', async () => {
    expect((await ask('groww details')).text).toMatch(/^Groww is a Fintech app/);
    expect((await ask('swiggy info')).text).toMatch(/^Swiggy is a Food & drink app/);
  });

  it('a screen topic it has no type for becomes a search', async () => {
    const reply = await ask('show me forgot password screens');
    expect(reply.go?.href).toBe('/inspirations/search?q=forgot%20password');
    expect(reply.text).toBe('Searching screens for “forgot password”.');
    expect((await ask('otp screens')).go?.href).toBe('/inspirations/search?q=otp');
  });

  it('helps someone who is lost', async () => {
    for (const text of ['i am lost', 'recommend something', 'what should i look at first', 'show everything']) {
      const reply = await ask(text);
      expect(reply.text, text).toMatch(/^Not sure where to start\?/);
      expect(reply.go, text).toBeUndefined();
      expect(reply.targets.map((t) => t.label), text).toContain('Surprise me');
    }
    expect((await ask('show me everything about groww')).go?.href).toBe('/inspirations/app/groww');
  });

  it('says what Motvin is, and what it does not know', async () => {
    expect((await ask('who built motvin')).text).toMatch(/^Motvin is a library of real app screens/);
    expect((await ask('what is motvin')).text).toMatch(/^Motvin is a library/);
    expect((await ask('is this free')).text).toMatch(/^I don’t know about plans or prices/);
    expect((await ask('how much does it cost')).text).toMatch(/^I don’t know about plans or prices/);
  });

  it('a style on its own, and short names for pages', async () => {
    expect((await ask('dark')).go?.href).toBe('/inspirations/screens?style=dark');
    expect((await ask('minimal')).go?.href).toBe('/inspirations/screens?style=minimal');
    expect((await ask('light mode')).go?.href).toBe('/inspirations/screens?style=light');
    expect((await ask('ui')).go?.href).toBe('/inspirations/ui-elements');
  });
});

describe('found against the real library', () => {
  it('a scope beats a pattern that shares the name', async () => {
    vi.mocked(inspirationsApi.listPatterns).mockResolvedValueOnce([{ id: 'p9', name: 'Empty states', slug: 'empty-states', category: 'Empty States', description: 'When there is nothing to show.', screenIds: [] }] as never);
    expect((await ask('empty states from food apps')).go?.href).toBe('/inspirations/screens?state=empty&industry=food');
    expect((await ask('empty states')).go?.href).toBe('/inspirations/pattern/empty-states');
    expect((await ask('empty states pattern')).go?.href).toBe('/inspirations/pattern/empty-states');
  });

  it('a definition does not borrow the app being discussed', async () => {
    const reply = await ask('what is a bottom sheet', ctx(SWIGGY));
    expect(reply.text).toMatch(/^I don’t write definitions/);
    expect(reply.go).toBeUndefined();
    expect((await ask('what is the rating', ctx(SWIGGY))).text).toBe('Swiggy is rated 5.0 out of 5 from 1 rating.');
    expect((await ask('what is this', ctx(SWIGGY))).text).toMatch(/^Swiggy is a Food & drink app/);
  });
});

describe('a platform in front of "screens" widens to the whole library', () => {
  it('even while one app is being discussed', async () => {
    expect((await ask('ios login screens', ctx(SWIGGY))).go?.href).toBe('/inspirations/screens?type=login&platform=ios');
    expect((await ask('login screens', ctx(SWIGGY))).go?.href).toBe('/inspirations/search?q=Swiggy%20login');
    expect((await ask('is it on ios', ctx(SWIGGY))).text).toBe('Yes — Swiggy is on iOS and Web Apps.');
  });
});
