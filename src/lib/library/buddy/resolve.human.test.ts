import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT, type LibraryParams } from '../../api/libraryParams';
import type { LibraryStats } from '../../api/stats';
import { resolveBuddy, topicFor, type BuddyContext } from './resolve';

/**
 * Messages as people write them to a chat: chatty, describing rather than
 * naming, lists, follow-ups, thanks and complaints. Each must end in the
 * search the page needs, or a short reply that keeps the visitor searching.
 */

const params = (patch: Partial<LibraryParams> = {}): LibraryParams => ({
  query: '',
  page: 1,
  sort: DEFAULT_SORT,
  sources: [],
  styles: [],
  categories: [],
  licenses: [],
  saved: false,
  ...patch,
});

const stats = (collections: Array<{ id: string; name: string }>, category: Record<string, number> = {}) =>
  ({
    stats: null,
    loading: false,
    total: 1000,
    collections,
    counts: { source: {}, style: {}, license: { MIT: 1, 'Apache 2.0': 1, 'CC BY-NC-SA 4.0': 1, 'CC0 1.0': 1 }, category },
  }) as unknown as LibraryStats;

const icons: BuddyContext = {
  config: { slug: 'icons', noun: 'icon', nounPlural: 'icons', styles: ['outline', 'solid', 'duotone', 'thin', '3d'] },
  stats: stats([
    { id: 'phosphor', name: 'Phosphor' },
    { id: 'heroicons', name: 'Heroicons' },
    { id: 'material-symbols', name: 'Material Symbols' },
    { id: 'lucide', name: 'Lucide' },
    { id: 'fa7', name: 'Font Awesome 7' },
    { id: 'bootstrap', name: 'Bootstrap Icons' },
  ]),
  params: params(),
};

const logos: BuddyContext = {
  config: { slug: 'logos', noun: 'logo', nounPlural: 'logos', styles: ['color', 'solid'] },
  stats: stats([{ id: 'logos', name: 'SVG Logos' }], { Technology: 22, Social: 3, Food: 0 }),
  params: params(),
};

const patchOf = (text: string, ctx: BuddyContext = icons) => {
  const r = resolveBuddy(text, ctx);
  return r.action?.type === 'params' ? r.action.patch : undefined;
};

describe('library buddy: describing, not naming', () => {
  it.each([
    ['Im looking for an icon that shows a user profile', 'user profile'],
    ['something that looks like a gear', 'gear'],
    ['an arrow pointing right', 'arrow right'],
    ['what icon should i use for logout', 'logout'],
    ['which icon is good for notifications', 'notifications'],
    ['an icon that represents success', 'success'],
    ['need something for delete', 'delete'],
    ['three dots icon', 'dots'],
    ['png icon of a car', 'car'],
    ['svg of a phone', 'phone'],
    ['home-icon', 'home'],
    ['HOME ICON', 'home'],
    ['open source icons for a startup', 'startup'],
    ['sharp corners icons', 'sharp corners'],
    ['bold home icon', 'bold home'],
  ])('%s', (text, query) => {
    expect(patchOf(text)?.query).toBe(query);
  });
});

describe('library buddy: lists are searched one at a time', () => {
  it.each([
    ['home, user and settings icons', 'home', ['“user” icons', '“settings” icons']],
    ['icons: home, user, settings', 'home', ['“user” icons', '“settings” icons']],
    ['I need 3 icons: cart, heart and user', 'cart', ['“heart” icons', '“user” icons']],
    ['facebook twitter instagram icons', 'facebook', ['“twitter” icons', '“instagram” icons']],
  ])('%s', (text, query, chips) => {
    const r = resolveBuddy(text, icons);
    expect(patchOf(text)?.query).toBe(query);
    expect(r.chips.map((c) => c.label).slice(0, chips.length)).toEqual(chips);
    expect(r.text).toMatch(/The others are below\.$/);
  });
});

describe('library buddy: sets by their everyday names', () => {
  it.each([
    ['font awesome user icon', 'user', 'fa7'],
    ['material icons for settings', 'settings', 'material-symbols'],
    ['bootstrap trash icon', 'trash', 'bootstrap'],
    ['lucide search', 'search', 'lucide'],
  ])('%s', (text, query, source) => {
    expect(patchOf(text)).toMatchObject({ query, sources: [source] });
  });
});

describe('library buddy: weight and style words', () => {
  it.each([
    ['make them thinner', ['thin']],
    ['thicker ones', ['outline']],
    ['heart but outlined', ['outline']],
    ['filled heart please', ['solid']],
  ])('%s', (text, styles) => {
    expect(patchOf(text)?.styles).toEqual(styles);
  });

  it('colour words choose the logo style', () => {
    expect(patchOf('white apple logo', logos)).toMatchObject({ query: 'apple', styles: ['solid'] });
    expect(patchOf('dark github logo', logos)).toMatchObject({ query: 'github', styles: ['solid'] });
    expect(patchOf('javascript logo yellow', logos)).toMatchObject({ query: 'javascript', styles: ['color'] });
  });
});

describe('library buddy: talking, not searching', () => {
  it.each([
    ['can u help me', /^Sure!/],
    ['i need help finding an icon', /^Sure!/],
    ['that is perfect thanks', /^Anytime/],
    ['wow amazing', /^Anytime/],
    ['this is wrong', /^Sorry about that/],
    ['not what i wanted', /^Sorry about that/],
    ['?', /^Which icons do you need/],
  ])('%s', (text, reply) => {
    const r = resolveBuddy(text, icons);
    expect(r.text).toMatch(reply);
    expect(r.action).toBeUndefined();
  });
});

describe('library buddy: page, sort and filter controls', () => {
  const viewing: BuddyContext = { ...icons, params: params({ query: 'home', styles: ['solid'], sources: ['phosphor'], page: 3 }), shownTotal: 905 };

  it.each([
    ['more like these', { page: 4 }],
    ['first page', { page: 1 }],
    ['last page', { page: 16 }],
    ['remove the style filter', { styles: [] }],
    ['any style', { styles: [] }],
    ['remove phosphor', { sources: [] }],
    ['newest icons', { sort: 'trending' }],
    ['whats popular right now', { sort: 'popular' }],
  ])('%s', (text, patch) => {
    expect(patchOf(text, viewing)).toMatchObject(patch);
  });

  it('removing one filter says what stays', () => {
    expect(resolveBuddy('remove phosphor', viewing).text).toBe('Removed Phosphor — still “home”.');
  });
});

describe('library buddy: moving between libraries', () => {
  it.each([
    ['go to the logos page', { type: 'library', category: 'logos' }],
    ['can you search logos for nike', { type: 'library', category: 'logos', patch: { query: 'nike' } }],
    ['I want logo of whatsapp', { type: 'library', category: 'logos', patch: { query: 'whatsapp' } }],
  ])('%s', (text, action) => {
    expect(resolveBuddy(text, icons).action).toMatchObject(action);
  });

  it('"logos for my footer" asks which brands', () => {
    expect(resolveBuddy('logos for my footer', logos).text).toMatch(/^Which logos do you need/);
  });
});

describe('library buddy: topics by their everyday names', () => {
  it('"tech" is Technology, an empty topic is none', () => {
    expect(topicFor('tech', { Technology: 22 })).toBe('Technology');
    expect(topicFor('payments', { Finance: 2 })).toBe('Finance');
    expect(topicFor('food', { Food: 0 })).toBeNull();
    expect(topicFor('rocket', { Technology: 22 })).toBeNull();
  });
});

describe('library buddy: removing a filter that is not on', () => {
  it('says so', () => {
    const r = resolveBuddy('remove the style filter', { ...icons, params: params({ query: 'home' }), shownTotal: 1521 });
    expect(r.text).toBe('No style filter is on — still “home”.');
    expect(r.action).toBeUndefined();
  });
});

describe('library buddy: brand groups on logos', () => {
  it.each([
    ['logos of all big tech companies', 'google', '“apple” logos'],
    ['social media logos', 'facebook', '“instagram” logos'],
    ['show me social logos', 'facebook', '“instagram” logos'],
    ['payment logos', 'visa', '“mastercard” logos'],
  ])('%s', (text, query, chip) => {
    const r = resolveBuddy(text, logos);
    expect(patchOf(text, logos)?.query).toBe(query);
    expect(r.chips.map((c) => c.label)).toContain(chip);
  });

  it('a named brand still wins: "instagram social logo"', () => {
    expect(patchOf('instagram social logo', logos)?.query).toBe('instagram');
  });
});

describe('library buddy: follow-ups use the conversation so far', () => {
  const afterAmazon: BuddyContext = { ...icons, params: params({ query: 'amazon' }), shownTotal: 151 };

  it.each([
    ['logo', 'logos'],
    ['logos', 'logos'],
    ['and logos?', 'logos'],
    ['what about logos', 'logos'],
    ['same in illustrations', 'illustrations'],
    ['logos too', 'logos'],
  ])('after “amazon” icons, "%s" is amazon in %s', (text, category) => {
    expect(resolveBuddy(text, afterAmazon).action).toMatchObject({ type: 'library', category, patch: { query: 'amazon' } });
  });

  it('a style comes along: "solid logos"', () => {
    expect(resolveBuddy('solid logos', afterAmazon).action).toMatchObject({ type: 'library', category: 'logos', patch: { query: 'amazon', styles: ['solid'] } });
  });

  it('plain navigation just goes', () => {
    expect(resolveBuddy('switch to logos', afterAmazon).action).toEqual({ type: 'library', category: 'logos' });
    expect(resolveBuddy('go to the logos page', afterAmazon).action).toEqual({ type: 'library', category: 'logos' });
  });

  it('a new subject keeps the filters: "what about bell?"', () => {
    const ctx: BuddyContext = { ...icons, params: params({ query: 'home', styles: ['solid'], sources: ['phosphor'] }), shownTotal: 12 };
    const r = resolveBuddy('what about bell?', ctx);
    expect(r.action).toEqual({ type: 'params', patch: { query: 'bell' } });
    expect(r.text).toBe('Showing “bell” icons — still Solid, from Phosphor.');
    expect(resolveBuddy('now a heart', ctx).action).toEqual({ type: 'params', patch: { query: 'heart' } });
  });

  it('with nothing searched yet, "logos" just opens Logos', () => {
    expect(resolveBuddy('logos', icons).action).toEqual({ type: 'library', category: 'logos' });
  });
});

describe('library buddy: a style follows the move when the next library has it', () => {
  it('Solid apple logos → "and icons?" is Solid apple icons; Duotone stays behind', () => {
    const solid: BuddyContext = { ...logos, params: params({ query: 'apple', styles: ['solid'] }), shownTotal: 19 };
    expect(resolveBuddy('and icons?', solid).action).toMatchObject({ type: 'library', category: 'icons', patch: { query: 'apple', styles: ['solid'] } });
    const duotone: BuddyContext = { ...icons, params: params({ query: 'apple', styles: ['duotone'] }), shownTotal: 9 };
    expect(resolveBuddy('logos', duotone).action).toMatchObject({ type: 'library', category: 'logos', patch: { query: 'apple', styles: [] } });
  });
});

describe('library buddy: emoji and other languages', () => {
  it.each([
    ['🔔', 'bell'],
    ['🔔 icon', 'bell'],
    ['🏠🏠', 'home'],
    ['a ⭐ icon please', 'star'],
  ])('%s reads as %s', (text, query) => {
    expect(patchOf(text)?.query).toBe(query);
  });

  it('keeps the style next to an emoji: "solid ❤️"', () => {
    expect(patchOf('solid ❤️')).toMatchObject({ query: 'heart', styles: ['solid'] });
  });

  it.each(['வீடு ஐகான்', 'घर का आइकन', '家のアイコン'])('%s: says it understands English, searches nothing', (text) => {
    const r = resolveBuddy(text, icons);
    expect(r.text).toMatch(/^I understand English for now/);
    expect(r.action).toBeUndefined();
    expect(r.chips).toHaveLength(3);
  });

  it('Latin-script words still search ("casa icono")', () => {
    expect(patchOf('casa icono')?.query).toBe('casa');
  });
});
