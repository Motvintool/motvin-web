import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT } from '../../api/libraryParams';
import type { LibraryStats } from '../../api/stats';
import { resolveBuddy, type BuddyContext } from './resolve';

/**
 * Sentences as people really type them: chatty, with what the icon is for,
 * typos and no punctuation. Each must come out as the search the page needs.
 */

const stats = {
  stats: null,
  loading: false,
  total: 390508,
  collections: [
    { id: 'phosphor', name: 'Phosphor', total: 9072 },
    { id: 'heroicons', name: 'Heroicons', total: 460 },
    { id: 'tabler', name: 'Tabler Icons', total: 6184 },
    { id: 'lucide', name: 'Lucide', total: 1786 },
    { id: 'weather', name: 'Weather Icons', total: 200 },
    { id: 'logos', name: 'SVG Logos', total: 1800 },
  ],
  counts: {
    source: {},
    style: { outline: 1, solid: 1, duotone: 1, thin: 1, '3d': 1 },
    license: { MIT: 1, 'Apache 2.0': 1, 'CC BY 4.0': 1, 'CC BY-NC-SA 4.0': 1, 'CC0 1.0': 1 },
    category: { Weather: 1, Commerce: 1, Finance: 1 },
  },
} as unknown as LibraryStats;

const icons: BuddyContext = {
  config: { slug: 'icons', noun: 'icon', nounPlural: 'icons', styles: ['outline', 'solid', 'duotone', 'thin', '3d'] },
  stats,
  params: { query: '', page: 1, sort: DEFAULT_SORT, sources: [], styles: [], categories: [], licenses: [], saved: false },
};

const CASES: Array<[string, string, string[]?]> = [
  ['hey give me a home icon for my project it should be outline style', 'home', ['outline']],
  ['i need a search icon for my website', 'search', []],
  ['can you show me some shopping cart icons', 'shopping cart', []],
  ['looking for a bell icon, solid please', 'bell', ['solid']],
  ['give me settings icon in thin style', 'settings', ['thin']],
  ['I want a user profile icon for our app', 'user profile', []],
  ['do you have any heart icons?', 'heart', []],
  ['need an arrow icon that is outlined', 'arrow', ['outline']],
  ['could you find me a calendar icon for a presentation', 'calendar', []],
  ['show me filled star icons', 'star', ['solid']],
  ['i am looking for something like a download icon', 'download', []],
  ['get me a trash icon for my client\'s dashboard', 'trash', []],
  ['make it duotone camera icons', 'camera', ['duotone']],
  ['plz give me lock icon', 'lock', []],
  ['hey buddy i want a wifi icon', 'wifi', []],
  ['i want a chat icon which should be solid', 'chat', ['solid']],
  ['an icon for payment in my e-commerce app', 'payment', []],
  ['icons related to weather', 'weather', []],
  ['what about a bank icon', 'bank', []],
  ['give me a mail icon for my figma file', 'mail', []],
  ['home icon outline', 'home', ['outline']],
  ['dashboard icon', 'dashboard', []],
  ['website icon', 'website', []],
  ['i need icons for my project about music', 'music', []],
  ['Hey, can I get a notification bell icon? Something minimal, thin lines', 'notification bell', ['thin']],
  ['need icons for a food delivery app', 'food delivery', []],
  ['pls show me a icon of user with plus', 'user plus', []],
  ['home icon but filled', 'home', ['solid']],
  ['home icon, not filled', 'home', ['outline']],
  ['I need a close/cancel icon', 'close', []],
  ['something to represent money', 'money', []],
  ['mit licensed outline arrows', 'arrows', ['outline']],
  ['share icon for social media', 'share', []],
  ['calender icon', 'calendar', []],
  ['notifcation icon', 'notification', []],
  ['shoping cart', 'shopping cart', []],
  ['search icon', 'search', []],
  ['like icon', 'like', []],
];

const logos: BuddyContext = {
  ...icons,
  config: { slug: 'logos', noun: 'logo', nounPlural: 'logos', styles: ['color', 'solid'] },
};

const LOGO_CASES: Array<[string, string, string[]?]> = [
  ['hey i need the apple logo', 'apple', []],
  ['show me google logo in black and white', 'google', ['solid']],
  ['react logo for my portfolio website', 'react', []],
  ['payment logos like visa and mastercard', 'visa', []],
  ['logos such as slack, notion or figma', 'slack', []],
  ['colored instagram logo', 'instagram', ['color']],
];

describe('library buddy: real sentences on logos', () => {
  it.each(LOGO_CASES)('%s', (text, query, styles = []) => {
    const r = resolveBuddy(text, logos);
    const patch = r.action?.type === 'params' ? r.action.patch : {};
    expect(patch.query).toBe(query);
    expect(patch.styles ?? []).toEqual(styles);
  });
});

describe('library buddy: real questions and requests', () => {
  it.each([
    ['how to change icon colour', /^I only search/],
    ['can i use these logos in my app', /^I only search/],
    ['how do i change the icon size', /^I only search/],
    ['which icons can i use for free in commercial projects', /^I only search/],
    ['thanks a lot', /Anytime/],
    ['who made you', /Motvin Buddy/],
  ])('%s', (text, answer) => {
    expect(resolveBuddy(text, icons).text).toMatch(answer);
  });

  it.each([
    ['next page please', { type: 'params', patch: { page: 2 } }],
    ['sort these by popularity', { type: 'params', patch: { sort: 'popular' } }],
    ['take me to illustrations', { type: 'library', category: 'illustrations' }],
    ['icons without attribution', { type: 'params', patch: { licenses: ['CC0 1.0'] } }],
  ])('%s', (text, action) => {
    expect(resolveBuddy(text, icons).action).toMatchObject(action);
  });
});

describe('library buddy: real sentences', () => {
  it.each(CASES)('%s', (text, query, styles = []) => {
    const r = resolveBuddy(text, icons);
    expect(r.action?.type).toBe('params');
    const patch = r.action?.type === 'params' ? r.action.patch : {};
    expect(patch.query).toBe(query);
    expect(patch.styles ?? []).toEqual(styles);
  });
});

describe('library buddy: follow-ups keep the search', () => {
  const after = (query: string, styles: string[] = []): BuddyContext => ({ ...icons, params: { ...icons.params, query, styles } });

  it.each([
    ["it's not good so give me solid style", { styles: ['solid'] }],
    ['i mean solid', { styles: ['solid'] }],
    ['try duotone instead', { styles: ['duotone'] }],
    ['from phosphor', { sources: ['phosphor'] }],
    ['only MIT', { licenses: ['MIT'] }],
  ])('%s', (text, patch) => {
    const r = resolveBuddy(text, after('home', ['outline']));
    expect(r.action).toEqual({ type: 'params', patch });
    expect(r.text).toMatch(/^Kept “home” — now /);
  });

  it('a new subject starts a fresh search', () => {
    expect(resolveBuddy('i mean solid style home icon', after('home', ['outline'])).action).toMatchObject({ patch: { query: 'home', styles: ['solid'] } });
    expect(resolveBuddy('a bell icon', after('home', ['outline'])).action).toMatchObject({ patch: { query: 'bell', styles: [] } });
  });

  it('"show me other ones" is the next page', () => {
    expect(resolveBuddy('show me other ones', after('home')).action).toEqual({ type: 'params', patch: { page: 2 } });
  });
});

describe('library buddy: named examples', () => {
  it('logos search the brands named, the rest as chips', () => {
    const r = resolveBuddy('payment logos like visa and mastercard', logos);
    expect(r.chips.map((c) => c.label)).toEqual(['“mastercard” logos']);
  });

  it('icons search the subject, examples aside', () => {
    expect(resolveBuddy('payment icons like visa and mastercard', icons).action).toMatchObject({ patch: { query: 'payment' } });
  });
});
