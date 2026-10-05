import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => {
  const apps = [
    { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'android'] },
    { id: 'a2', name: 'Zomato', slug: 'zomato', screenCount: 140, flowCount: 85, logo: null, industry: 'food', rating: 4.5, ratingCount: 12, platforms: ['ios', 'web'] },
    { id: 'a3', name: 'Zoho Corporation', slug: 'zoho', screenCount: 12, flowCount: 3, logo: null, industry: 'saas', rating: null, ratingCount: null, platforms: ['web'] },
    { id: 'a4', name: 'Groww', slug: 'groww', screenCount: 90, flowCount: 20, logo: null, industry: 'fintech', rating: 4.2, ratingCount: 3, platforms: ['ios', 'android'] },
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

import { inspirationsApi } from './api';
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

  it('reads "sorry web" as web apps', async () => {
    const reply = await ask('sorry web');
    expect(reply.go?.href).toBe('/inspirations/apps?platform=web');
    expect(reply.text).toBe('Showing web apps.');
    expect(reply.targets.map((t) => t.label)).toEqual(['Zomato', 'Zoho Corporation']);
  });

  it('reads "i mean web application" the same way', async () => {
    const reply = await ask('i mean web application');
    expect(reply.go?.href).toBe('/inspirations/apps?platform=web');
    expect(reply.text).toBe('Showing web apps.');
  });
});

describe('where an app runs', () => {
  it.each([
    ['ios apps', '/inspirations/apps?platform=ios'],
    ['iphone apps', '/inspirations/apps?platform=ios'],
    ['android apps', '/inspirations/apps?platform=android'],
    ['android', '/inspirations/apps?platform=android'],
    ['web apps', '/inspirations/apps?platform=web'],
    ['web applications', '/inspirations/apps?platform=web'],
    ['website apps', '/inspirations/apps?platform=web'],
  ])('%s', async (text, href) => {
    expect((await ask(text)).go?.href).toBe(href);
  });

  it('counts them from the library', async () => {
    expect((await ask('how many android apps are there')).text).toBe('There are 2 Android apps — Swiggy and Groww.');
    expect((await ask('how many web apps')).text).toBe('There are 2 web apps — Zomato and Zoho Corporation.');
  });

  it('combines with a kind of app', async () => {
    const reply = await ask('food web apps');
    expect(reply.go?.href).toBe('/inspirations/apps?platform=web&industry=food');
    expect(reply.text).toBe('Showing Food & drink web apps.');
    expect(reply.targets.map((t) => t.label)).toEqual(['Zomato']);
  });

  it('can be ranked', async () => {
    expect((await ask('which web app has the most screens')).text).toBe('Among web apps, Zomato has the most screens (140), followed by Zoho Corporation (12).');
  });

  it('reads a misspelt platform', async () => {
    expect((await ask('andriod apps')).go?.href).toBe('/inspirations/apps?platform=android');
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
    expect(reply.text).toBe('Yes — Swiggy is on iOS and Android.');
    expect(reply.go).toBeUndefined();
  });
});

describe('questions about where an app runs', () => {
  const swiggy = { app: { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'android'] } as never };
  const zoho = { app: { id: 'a3', name: 'Zoho Corporation', slug: 'zoho', screenCount: 12, flowCount: 3, logo: null, industry: 'saas', rating: null, ratingCount: null, platforms: ['web'] } as never };

  it.each([
    ['is it on ios', 'Yes — Swiggy is on iOS and Android.'],
    ['is it on android?', 'Yes — Swiggy is on iOS and Android.'],
    ['is it on web', 'No — Swiggy isn’t on the web. It’s on iOS and Android.'],
    ['is it available on the web?', 'No — Swiggy isn’t on the web. It’s on iOS and Android.'],
    ['what platform is it on', 'Swiggy is on iOS and Android.'],
    ['where does it run', 'Swiggy is on iOS and Android.'],
    ['is it on ios or android', 'Swiggy is on iOS and Android.'],
    ['is it a mobile app', 'Yes — Swiggy is on iOS and Android.'],
  ])('%s', async (text, expected) => {
    const reply = await ask(text, swiggy);
    expect(reply.text).toBe(expected);
    expect(reply.go).toBeUndefined();
  });

  it('works with the app named', async () => {
    expect((await ask('is zomato on the web')).text).toBe('Yes — Zomato is on iOS and the web.');
    expect((await ask('what platforms is groww on')).text).toBe('Groww is on iOS and Android.');
    expect((await ask('does swiggy work on web?')).text).toBe('No — Swiggy isn’t on the web. It’s on iOS and Android.');
  });

  it('knows a web-only app is not on mobile', async () => {
    expect((await ask('is it on mobile', zoho)).text).toBe('No — Zoho Corporation isn’t on mobile. It’s on the web.');
  });

  it('still opens the app for a command, when the app is on that platform', async () => {
    const reply = await ask('show swiggy on android');
    expect(reply.go?.href).toBe('/inspirations/app/swiggy');
    expect(reply.text).toBe('Swiggy is on iOS and Android.');
  });

  it('does not open the app for a command naming a platform it is not on', async () => {
    const reply = await ask('swiggy on web');
    expect(reply.go).toBeUndefined();
    expect(reply.text).toBe('Swiggy isn’t on the web. It’s on iOS and Android.');
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
  const swiggy = { app: { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'android'] } as never };

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
    expect(reply.card?.facts).toEqual(['Food & drink', 'iOS · Web'.replace('Web', 'web'), '140 screens', '85 flows']);
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
    ['on ios?', 'Swiggy is on iOS and Android.'],
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
    expect((await ask('web apps', { app: swiggy })).go?.href).toBe('/inspirations/apps?platform=web');
    expect((await ask('compare swiggy and zomato', { app: swiggy })).go).toBeUndefined();
    expect((await ask('flows', { app: swiggy })).go?.href).toBe('/inspirations/flows');
  });

  it('with nothing shown yet, a bare count is the whole library', async () => {
    expect((await ask('how much screens have?')).text).toMatch(/^The library has 4 apps/);
  });
});
