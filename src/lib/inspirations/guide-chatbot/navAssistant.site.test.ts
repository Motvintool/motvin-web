import { beforeEach, describe, expect, it, vi } from 'vitest';

// The three platforms: Swiggy is an app (iOS) with a web app; Remote is a website (Webs) with two pages.
vi.mock('../api', () => {
  const apps = [
    { id: 'swiggy', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: null, ratingCount: null, platforms: ['ios', 'webapp'], platformCounts: { ios: { screens: 200, flows: 30 }, webapp: { screens: 62, flows: 9 } } },
    { id: 'remote', name: 'Remote', slug: 'remote', screenCount: 2, flowCount: 0, logo: null, industry: 'saas', rating: null, ratingCount: null, platforms: ['site'], platformCounts: { site: { screens: 2, flows: 0 } } },
  ];
  const pages = [
    { id: 'remote-site-versions-2026-11-23-pages-1', appId: 'remote', site: { kind: 'page', pageType: 'landing' } },
    { id: 'remote-site-versions-2026-11-23-pages-2', appId: 'remote', site: { kind: 'page', pageType: 'pricing' } },
    { id: 'remote-site-versions-2026-11-23-sections-1-6', appId: 'remote', site: { kind: 'section', sectionType: 'hero' } },
    { id: 'remote-site-versions-2026-11-23-sections-2-7', appId: 'remote', site: { kind: 'section', sectionType: 'pricing' } },
  ];
  return {
    inspirationsApi: {
      listApps: vi.fn(async () => apps),
      listFlows: vi.fn(async () => []),
      listScreens: vi.fn(async () => ({ items: [], total: 5, limit: 24, offset: 0, nextOffset: null })),
      listSiteScreens: vi.fn(async (kind: string, type: string) => pages.filter((page) => page.site.kind === kind && (kind === 'page' ? page.site.pageType : page.site.sectionType) === type)),
      getMeta: vi.fn(async () => ({ taxonomy: { screenTypes: ['login', 'pricing', 'settings'], industries: [], flowCategories: [] } })),
      listPatterns: vi.fn(async () => []),
      // Forms are a UI element of app screens: on iOS and Web Apps, never on a site.
      listElements: vi.fn(async (on?: string[]) => (!on || on.includes('ios') ? [{ kind: 'form', count: on ? 385 : 613 }] : on.includes('webapp') ? [{ kind: 'form', count: 228 }] : [])),
      mediaUrl: vi.fn(() => null),
    },
  };
});

import { resetIndex } from './guideIndex';
import { resolveNavigation } from './navAssistant';

beforeEach(() => resetIndex());

const onWebs = { app: null, page: { pathname: '/inspirations/apps', search: '?platform=web' } };
const pricingPage = '/inspirations/app/remote?screen=remote-site-versions-2026-11-23-pages-2';

describe('Webs is Web Apps and Sites together; Sites are pages, never app screens', () => {
  // Sites asked for: every site's Pricing Pages in one grid, as the Screens page is for apps.
  it('pricing pages on websites', async () => {
    expect((await resolveNavigation('pricing pages on websites', onWebs)).go?.href).toBe('/inspirations/sites?platform=web&type=pricing');
  });

  // Webs asked for: the Web App screens, with the sites' Pricing Pages beside them — neither left out.
  it.each(['i want pricing page webs', 'show me price web'])('%s', async (text) => {
    const reply = await resolveNavigation(text, onWebs);
    expect(reply.go?.href).toBe('/inspirations/screens?type=pricing&platform=web');
    expect(reply.targets?.map((t) => t.href)).toContain('/inspirations/sites?platform=web&type=pricing');
  });

  it('a website named opens its own page', async () => {
    expect((await resolveNavigation('remote pricing', onWebs)).go?.href).toBe(pricingPage);
  });

  it('says when a website has no such page', async () => {
    expect((await resolveNavigation('remote about page', onWebs)).text).toBe('Remote has no About Page yet.');
  });

  it('counts a website in pages', async () => {
    expect((await resolveNavigation('how many screens does remote have', onWebs)).text).toBe('Remote has 2 pages.');
  });
});

describe('Web Apps and Apps keep their screens', () => {
  it('reads "web apps" as Web Apps', async () => {
    expect((await resolveNavigation('pricing screens on web apps', onWebs)).go?.href).toBe('/inspirations/screens?type=pricing&platform=webapp');
  });

  it('reads iOS as Apps', async () => {
    expect((await resolveNavigation('ios pricing screens', onWebs)).go?.href).toBe('/inspirations/screens?type=pricing&platform=ios');
  });
});

describe('a move to another platform asks the last question again', () => {
  it.each([
    ['for web', '/inspirations/screens?type=settings&platform=web'],
    ['on ios', '/inspirations/screens?type=settings&platform=ios'],
    ['what about web apps', '/inspirations/screens?type=settings&platform=webapp'],
    ['in apps', '/inspirations/screens?type=settings&platform=ios'],
  ])('i want setting page → %s', async (move, href) => {
    const first = await resolveNavigation('i want setting page', onWebs);
    const reply = await resolveNavigation(move, { ...onWebs, previous: first.asked });
    expect(reply.go?.href).toBe(href);
  });
});

describe('web is Webs, websites are websites', () => {
  it('web: the Webs screens (web apps)', async () => {
    expect((await resolveNavigation('login screens on web', onWebs)).go?.href).toBe('/inspirations/screens?type=login&platform=web');
  });

  it('websites: a page a website has not got, said so', async () => {
    expect((await resolveNavigation('website login', onWebs)).text).toBe('No site has a Login Page yet.');
  });

  it('lists websites, not the List element', async () => {
    expect((await resolveNavigation('list websites', onWebs)).text).toBe('Showing sites.');
  });

  it('opens sections', async () => {
    expect((await resolveNavigation('sections', onWebs)).go?.href).toBe('/inspirations/sites?platform=web&tab=sections');
    expect((await resolveNavigation('hero section', onWebs)).go?.href).toBe('/inspirations/sites?platform=web&tab=sections&type=hero');
    expect((await resolveNavigation('show web pages', onWebs)).go?.href).toBe('/inspirations/sites?platform=web');
  });

  it('explains the three platforms', async () => {
    expect((await resolveNavigation('what is the difference between web app and website', onWebs)).text).toContain('Motvin has three platforms');
  });

  it('leaves "web design" alone', async () => {
    expect((await resolveNavigation('what is a good web design tip', onWebs)).go).toBeUndefined();
  });
});

describe('the conversation from the screenshot: price, then platforms and kinds', () => {
  const onApps = { app: null, page: { pathname: '/inspirations/ui-elements', search: '' } };
  it('"price page" is pricing screens, not the Price element', async () => {
    expect((await resolveNavigation('show me price page', onApps)).go?.href).toBe('/inspirations/screens?type=pricing');
  });

  it.each([
    ['web', '/inspirations/screens?type=pricing&platform=web'],
    ['site', '/inspirations/sites?platform=web&type=pricing'],
    ['web app', '/inspirations/screens?type=pricing&platform=webapp'],
    ['section', '/inspirations/sites?platform=web&tab=sections&type=pricing'],
  ])('show me price page → %s', async (move, href) => {
    const first = await resolveNavigation('show me price page', onApps);
    expect((await resolveNavigation(move, { ...onApps, previous: first.asked })).go?.href).toBe(href);
  });

  it('full page after web app and section is the websites\' pricing pages', async () => {
    let previous: string | undefined;
    for (const text of ['show me price page', 'web app', 'section']) previous = (await resolveNavigation(text, { ...onApps, previous })).asked;
    expect((await resolveNavigation('full page', { ...onApps, previous })).go?.href).toBe('/inspirations/sites?platform=web&type=pricing');
  });

  it('a kind the topic has none of opens all of that kind', async () => {
    const first = await resolveNavigation('hero section', onWebs);
    expect((await resolveNavigation('full page', { ...onWebs, previous: first.asked })).go?.href).toBe('/inspirations/sites?platform=web');
  });
});

describe('a UI element on the web stays a UI element', () => {
  it('nav bar → for web is not website sections', async () => {
    const first = await resolveNavigation('nav bar', onWebs);
    const reply = await resolveNavigation('for web', { ...onWebs, previous: first.asked });
    expect(reply.go?.href ?? '').not.toContain('site-pages');
  });
});

describe('a page on a platform opens that page there', () => {
  it.each([
    ['flows on web', '/inspirations/flows?platform=web'],
    ['web flows', '/inspirations/flows?platform=web'],
    ['flows on ios', '/inspirations/flows'],
    ['patterns on web apps', '/inspirations/patterns?platform=webapp'],
  ])('%s', async (text, href) => {
    expect((await resolveNavigation(text, { app: null, page: { pathname: '/inspirations/apps', search: '' } })).go?.href).toBe(href);
  });

  it('sites have no flows, and says so', async () => {
    const reply = await resolveNavigation('flows on sites', onWebs);
    expect(reply.text).toBe('Sites have pages and sections, not flows. Web Apps have them.');
    expect(reply.go).toBeUndefined();
  });

  it('new this week on web stays on Webs', async () => {
    expect((await resolveNavigation('new this week on web', { app: null, page: { pathname: '/inspirations/apps', search: '' } })).go?.href).toBe('/inspirations/new?platform=web');
  });

  it('says UI elements in capitals', async () => {
    expect((await resolveNavigation('ui elements on sites', onWebs)).text).toBe('Sites have pages and sections, not UI elements. Web Apps have them.');
  });

  it('web screens are on Webs, not Sites', async () => {
    expect((await resolveNavigation('login screens on web', onWebs)).text).toBe('Showing login screens on Webs. All from Web Apps. Sites have pages and sections, not login screens.');
  });

  it('an app with neither is said to have no web app or site', async () => {
    expect((await resolveNavigation('is swiggy on web', onWebs)).text).not.toContain('has no site');
  });
});

describe('a UI element asked for keeps its topic when the platform changes', () => {
  const onSites = { app: null, page: { pathname: '/inspirations/sites', search: '?platform=web' } };
  async function chat(texts: string[]) {
    let previous: string | undefined;
    const replies = [];
    for (const text of texts) {
      const reply = await resolveNavigation(text, { ...onSites, previous });
      previous = reply.asked;
      replies.push(reply);
    }
    return replies;
  }

  // On Webs, "form page" counts Webs' forms (Web Apps'), not every platform's.
  it('counts the section it is asked in', async () => {
    const [reply] = await chat(['hey i want form page']);
    expect(reply.text).toBe('Showing forms — 228 screens. All from Web Apps. Sites have pages and sections, not forms.');
    expect(reply.go?.href).toBe('/inspirations/ui-elements?element=form&platform=web');
  });

  it.each([
    ['for web app', 'Showing forms on Web Apps — 228 screens.', '/inspirations/ui-elements?element=form&platform=webapp'],
    ['web', 'Showing forms on Webs — 228 screens. All from Web Apps. Sites have pages and sections, not forms.', '/inspirations/ui-elements?element=form&platform=web'],
    ['webs', 'Showing forms on Webs — 228 screens. All from Web Apps. Sites have pages and sections, not forms.', '/inspirations/ui-elements?element=form&platform=web'],
    ['for app', 'Showing forms on iOS — 385 screens.', '/inspirations/ui-elements?element=form&platform=ios'],
    ['app', 'Showing forms on iOS — 385 screens.', '/inspirations/ui-elements?element=form&platform=ios'],
  ])('form page → %s', async (move, text, href) => {
    const [, reply] = await chat(['i want form page', move]);
    expect(reply.text).toBe(text);
    expect(reply.go?.href).toBe(href);
  });

  // Sites have no UI elements: said so, with the forms from Web Apps and the sites' own pages and sections.
  it.each(['sorry for site', 'site', 'on sites'])('form page → %s', async (move) => {
    const [, reply] = await chat(['i want form page', move]);
    expect(reply.text).toBe('Sites have pages and sections, not forms. Showing forms from Web Apps.');
    expect(reply.go?.href).toBe('/inspirations/ui-elements?element=form&platform=webapp');
    expect(reply.targets.map((t) => t.href)).toEqual(['/inspirations/sites?platform=web', '/inspirations/sites?platform=web&tab=sections']);
  });
});

describe('screens on Webs say they are all from Web Apps', () => {
  const onSites = { app: null, page: { pathname: '/inspirations/sites', search: '?platform=web' } };
  const note = 'All from Web Apps. Sites have pages and sections, not settings screens.';
  it.each([
    [[ 'i want setting page'], `Showing settings screens. ${note}`],
    [[ 'i want setting page', 'for web'], `Showing settings screens on Webs. ${note}`],
    [[ 'i want setting page', 'web'], `Showing settings screens on Webs. ${note}`],
  ])('%j', async (texts, text) => {
    let previous: string | undefined;
    let reply = await resolveNavigation(texts[0], onSites);
    for (const t of texts.slice(1)) { previous = reply.asked; reply = await resolveNavigation(t, { ...onSites, previous }); }
    expect(reply.text).toBe(text);
    expect(reply.targets.map((t) => t.label)).toEqual(['Site pages', 'Site sections']);
  });

  it('web apps alone, and iOS, need no note', async () => {
    const first = await resolveNavigation('i want setting page', onSites);
    for (const move of ['web app', 'app']) expect((await resolveNavigation(move, { ...onSites, previous: first.asked })).text).not.toMatch(/Sites have/);
  });
});

describe('every platform word after a question keeps it, and says where', () => {
  const onSites = { app: null, page: { pathname: '/inspirations/sites', search: '?platform=web' } };
  async function after(first: string, move: string) {
    const one = await resolveNavigation(first, onSites);
    return resolveNavigation(move, { ...onSites, previous: one.asked, app: one.app ?? null });
  }

  // An app on iOS and Web Apps: its screens of that kind, on the platform named.
  it.each([
    ['app', 'Showing Swiggy’s login screens on iOS.'],
    ['web app', 'Showing Swiggy’s login screens on Web Apps.'],
    ['site', 'Swiggy has no site here. It’s on iOS and Web Apps.'],
  ])('swiggy login → %s', async (move, text) => {
    expect((await after('swiggy login', move)).text).toBe(text);
  });

  // A site is on Sites alone.
  it.each([
    ['app', 'Remote isn’t on iOS. It’s on Sites.'],
    ['web app', 'Remote isn’t on Web Apps. It’s on Sites.'],
    ['site', 'Opening Remote’s Pricing Page.'],
  ])('remote pricing → %s', async (move, text) => {
    expect((await after('remote pricing', move)).text).toBe(text);
  });

  // A site's pages and sections are on Sites only, said so on iOS and Web Apps.
  it('a page no site has', async () => {
    expect((await resolveNavigation('about page', onSites)).text).toBe('No site has an About Page yet.');
    expect((await after('about page', 'app')).text).toBe('About Pages are only on Sites, and no site has an About Page yet.');
  });

  it.each(['app', 'web app'])('hero section → %s', async (move) => {
    const reply = await after('hero section', move);
    expect(reply.text).toBe('Hero sections are only on Sites. Showing them from 1 site.');
    expect(reply.go?.href).toBe('/inspirations/sites?platform=web&tab=sections&type=hero');
  });
});

describe('short slips', () => {
  const onSites = { app: null, page: { pathname: '/inspirations/sites', search: '?platform=web' } };
  it.each([
    ['logn page', '/inspirations/screens?type=login&platform=web'],
    ['webb apps', '/inspirations/apps?show=webapps&platform=web'],
  ])('%s', async (text, href) => {
    expect((await resolveNavigation(text, onSites)).go?.href).toBe(href);
  });
});
