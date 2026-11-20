import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT, type LibraryParams } from '../../api/libraryParams';
import type { LibraryStats } from '../../api/stats';
import { emptyResultReply, looserQueries, parseFind, resolveBuddy, starterChips, type BuddyContext } from './resolve';

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

const iconStats = {
  stats: null,
  loading: false,
  total: 390508,
  collections: [
    { id: 'phosphor', name: 'Phosphor', total: 9072 },
    { id: 'tabler', name: 'Tabler Icons', total: 5900 },
    { id: 'simple-icons', name: 'Simple Icons', total: 3300 },
    { id: 'material-symbols', name: 'Material Symbols', total: 15000 },
  ],
  counts: {
    source: { phosphor: 9072, tabler: 5900, 'simple-icons': 3300, 'material-symbols': 15000 },
    style: { outline: 76381, solid: 210911, duotone: 30450, thin: 15640, '3d': 57126 },
    license: { MIT: 200000, 'Apache 2.0': 50000, 'CC0 1.0': 3000, 'CC BY 4.0': 4000, 'CC BY-NC-SA 4.0': 1200 },
    category: { Weather: 900, Arrows: 2000 },
  },
} as unknown as LibraryStats;

const icons: BuddyContext = {
  config: { slug: 'icons', noun: 'icon', nounPlural: 'icons', styles: ['outline', 'solid', 'duotone', 'thin', '3d'] },
  stats: iconStats,
  params: params(),
};

const logos: BuddyContext = {
  config: { slug: 'logos', noun: 'logo', nounPlural: 'logos', styles: ['color', 'solid'] },
  stats: {
    ...iconStats,
    total: 10582,
    collections: [{ id: 'svg-logos', name: 'SVG Logos', total: 1800 }],
    counts: { source: { 'svg-logos': 1800 }, style: { color: 6145, solid: 4437 }, license: { CC0: 9000, MIT: 1500 }, category: {} },
  } as unknown as LibraryStats,
  params: params(),
};

const ask = (text: string, ctx: BuddyContext = icons) => resolveBuddy(text, ctx);

describe('library buddy: finding', () => {
  it('reads style, subject, source and licence from one sentence', () => {
    const r = ask('thin weather icons from Phosphor, MIT only');
    expect(r.action).toEqual({
      type: 'params',
      patch: { query: 'weather', styles: ['thin'], sources: ['phosphor'], licenses: ['MIT'], categories: [] },
    });
    expect(r.text).toContain('Phosphor');
  });

  it('matches a source by its short name and keeps multi-word names whole', () => {
    expect(parseFind('tabler arrows', icons).sources).toEqual([{ id: 'tabler', name: 'Tabler Icons' }]);
    const simple = parseFind('github from simple icons', icons);
    expect(simple.sources.map((s) => s.id)).toEqual(['simple-icons']);
    expect(simple.query).toBe('github');
  });

  it('maps "colorful" to 3D for icons and to Color for logos', () => {
    expect(parseFind('colorful rocket', icons).styles).toEqual(['3d']);
    expect(parseFind('colorful google', logos).styles).toEqual(['color']);
  });

  it('turns "commercial" into every licence without a non-commercial clause', () => {
    const licenses = parseFind('commercial arrows', icons).licenses;
    expect(licenses).toContain('MIT');
    expect(licenses).not.toContain('CC BY-NC-SA 4.0');
  });

  it('a bare refinement keeps the current search', () => {
    const r = ask('only MIT', { ...icons, params: params({ query: 'home', styles: ['outline'] }) });
    expect(r.action).toEqual({ type: 'params', patch: { licenses: ['MIT'] } });
    expect(r.text).toBe('Kept “home” — now MIT only.');
    // Outline is already picked: no "Only Solid" style chips.
    expect(r.chips.some((c) => c.label.startsWith('Only '))).toBe(false);
  });

  it('switches library when another one is named', () => {
    expect(ask('show logos').action).toEqual({ type: 'library', category: 'logos' });
    expect(ask('solid google logos').action).toEqual({
      type: 'library',
      category: 'logos',
      patch: { query: 'google', styles: ['solid'] },
    });
  });

  it('says when a library lacks a style', () => {
    const r = ask('duotone logos', logos);
    expect(r.kind).toBe('clarify');
    expect(r.text).toMatch(/don't come in Duotone/);
  });

  it('leaves the Saved view for a search', () => {
    const r = ask('arrow icons', { ...icons, params: params({ saved: true }) });
    expect(r.action).toMatchObject({ type: 'params', patch: { query: 'arrow', saved: false } });
  });

  it('fixes typos in source and style names', () => {
    const r = ask('outlnie icons from phosphr');
    expect(r.action).toMatchObject({ patch: { styles: ['outline'], sources: ['phosphor'] } });
    expect(r.corrections.length).toBeGreaterThan(0);
  });
});

describe('library buddy: everyday-word source names', () => {
  const real: BuddyContext = {
    ...icons,
    stats: {
      ...iconStats,
      collections: [
        { id: 'phosphor', name: 'Phosphor', total: 9072 },
        { id: 'weather', name: 'Weather Icons', total: 200 },
        { id: 'logos', name: 'SVG Logos', total: 1800 },
        { id: 'feather', name: 'Feather', total: 280 },
      ],
    } as unknown as LibraryStats,
  };

  it('reads them as search words when said plainly', () => {
    const p = parseFind('thin weather icons from phosphor', real);
    expect(p.query).toBe('weather');
    expect(p.sources.map((s) => s.id)).toEqual(['phosphor']);
    expect(parseFind('feather icons', real).sources).toEqual([]);
  });

  it('reads them as the source when said as one', () => {
    expect(parseFind('sun from weather icons', real).sources.map((s) => s.id)).toEqual(['weather']);
    expect(parseFind('the feather set', real).sources.map((s) => s.id)).toEqual(['feather']);
  });

  it('never reads an id: "logos" is the library, not SVG Logos', () => {
    expect(resolveBuddy('show logos', real).action).toEqual({ type: 'library', category: 'logos' });
  });
});

describe('library buddy: controls', () => {
  it('clears, pages and sorts', () => {
    expect(ask('clear filters').action).toMatchObject({ patch: { query: '', styles: [], sources: [] } });
    expect(ask('next', { ...icons, params: params({ page: 3 }) }).action).toEqual({ type: 'params', patch: { page: 4 } });
    expect(ask('page 7').action).toEqual({ type: 'params', patch: { page: 7 } });
    expect(ask('previous').text).toMatch(/first page/);
    expect(ask('sort by popular').action).toEqual({ type: 'params', patch: { sort: 'popular' } });
  });

  it('opens no panels: "shortcuts" or "saved" alone are searches', () => {
    expect(ask('shortcuts').action?.type).toBe('params');
    expect(ask('saved').action?.type).toBe('params');
  });
});

describe('library buddy: search only', () => {
  it.each([
    'how do I recolor icons?',
    'how can I download a png',
    'can I copy react code?',
    'can I use these for commercial projects?',
    'how many icons',
    'how many thin icons do you have',
    'what is the difference between outline and solid?',
    'is it free?',
    'how to change icon colour',
    'change color of icons',
    'export svg',
  ])('"%s" points back to searching', (text) => {
    const r = ask(text);
    expect(r.kind).toBe('clarify');
    expect(r.action).toBeUndefined();
    expect(r.text).toMatch(/^I only search icons, logos and illustrations/);
    expect(r.chips.length).toBe(3);
  });

  it.each([
    ['do you have any heart icons?', 'heart'],
    ['can you show me some shopping cart icons', 'shopping cart'],
    ['download icon', 'download'],
    ['save icon', 'save'],
    ['copy icon', 'copy'],
    ['color palette icon', 'palette'],
  ])('"%s" is still a search', (text, query) => {
    expect(ask(text).action).toMatchObject({ type: 'params', patch: { query } });
  });

  it('handles small talk and empty input', () => {
    expect(ask('hi').kind).toBe('small-talk');
    expect(ask('thanks!').kind).toBe('small-talk');
    expect(ask('what can you do').text).toMatch(/search icons, logos and illustrations/);
    expect(ask('   ').kind).toBe('clarify');
  });

  it('works before stats arrive', () => {
    const r = ask('outline home icons', { ...icons, stats: null });
    expect(r.action).toMatchObject({ patch: { query: 'home', styles: ['outline'] } });
  });

  it('offers three starter searches', () => {
    expect(starterChips(icons).map((c) => c.label)).toEqual(['Thin weather icons', 'Phosphor icons', 'Outline arrows, MIT']);
    expect(starterChips(logos)).toHaveLength(3);
  });

  it('every starter chip is a search', () => {
    for (const ctx of [icons, logos]) {
      for (const chip of starterChips(ctx)) {
        expect(chip.ask && resolveBuddy(chip.ask, ctx).action?.type).toBe('params');
      }
    }
  });
});

describe('library buddy: everyday phrasing', () => {
  it('reads "black and white" as Solid and "light icons" as Thin', () => {
    expect(ask('black and white icons').action).toMatchObject({ patch: { styles: ['solid'] } });
    expect(ask('light icons').action).toMatchObject({ patch: { styles: ['thin'] } });
    expect(ask('light bulb icons').action).toMatchObject({ patch: { query: 'light bulb', styles: [] } });
  });
});

describe('library buddy: empty results', () => {
  it('offers to drop each filter, by name', () => {
    const r = emptyResultReply(params({ query: 'weather', styles: ['thin'], sources: ['phosphor'] }), icons);
    expect(r.chips.map((c) => c.label)).toEqual(['Without Thin', 'Without Phosphor', 'Only “weather”']);
    expect(r.chips[1].action).toEqual({ type: 'params', patch: { sources: [] } });
  });

  it('suggests another word, or the other libraries, when only the search is left', () => {
    const r = emptyResultReply(params({ query: 'travel' }), icons);
    expect(r.text).toBe('No icons match “travel”. Try another word, or look in Logos or Illustrations:');
    expect(r.chips.map((c) => c.label)).toEqual(['“travel” logos', '“travel” illustrations']);
    expect(r.chips[1].action).toEqual({ type: 'library', category: 'illustrations', patch: { query: 'travel' } });
  });
});

describe('library buddy: greetings and split brand names', () => {
  it.each([
    ['hey i want linked in solid icon', 'linkedin'],
    ['hey i want LinkedIn solid icon', 'linkedin'],
    ['hi buddy, you tube icons', 'youtube'],
    ['hello! insta icon please', 'instagram'],
    ['git hub logo icon', 'github'],
    ['whats app icon', 'whatsapp'],
  ])('%s', (text, query) => {
    expect(ask(text).action).toMatchObject({ type: 'params', patch: { query } });
  });

  it('keeps the style next to a greeting', () => {
    expect(ask('hey i want linked in solid icon').action).toMatchObject({ patch: { query: 'linkedin', styles: ['solid'] } });
  });

  it('a greeting alone is still small talk', () => {
    expect(ask('hey').kind).toBe('small-talk');
    expect(ask('hello there').kind).toBe('small-talk');
  });
});

describe('library buddy: loosening an empty search', () => {
  it('tries fewer words, longest first', () => {
    expect(looserQueries('person working laptop')).toEqual([
      'person working', 'person laptop', 'working laptop', 'person', 'working', 'laptop',
    ]);
    expect(looserQueries('home')).toEqual([]);
  });

  it('a follow-up after an empty search starts fresh', () => {
    const r = ask('solid ones', { ...icons, params: params({ query: 'doodle people' }), shownTotal: 0 });
    expect(r.action).toMatchObject({ type: 'params', patch: { query: '', styles: ['solid'] } });
  });
});

describe('library buddy: a fresh page has nothing to follow up on', () => {
  it('"solid illustrations" first is a new search', () => {
    const r = ask('solid icons');
    expect(r.text).toBe('Showing Solid icons.');
  });

  it('filters on filters say "Now…"', () => {
    const r = ask('only MIT', { ...icons, params: params({ categories: ['Weather'] }), shownTotal: 95 });
    expect(r.text).toBe('Now MIT only.');
    expect(r.action).toEqual({ type: 'params', patch: { licenses: ['MIT'] } });
  });
});

describe('library buddy: greeting', () => {
  it('says hi briefly, for the library it is in, with starter searches', () => {
    expect(ask('hey').text).toBe('Hi! What icons are you looking for? Tell me a name, a style or a source, or pick one below.');
    expect(ask('hi', logos).text).toBe('Hi! Which logos are you looking for? Tell me a brand, or pick one below.');
    expect(ask('hello').chips).toHaveLength(3);
  });
});

describe('library buddy: an empty filtered search says what found nothing', () => {
  it('names the style, search and source', () => {
    const r = emptyResultReply(params({ query: 'amazon', styles: ['solid'], sources: ['phosphor'] }), icons);
    expect(r.text).toBe('No Solid “amazon” icons from Phosphor. Loosen one thing:');
  });
});
