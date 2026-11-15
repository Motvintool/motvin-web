import { describe, expect, it } from 'vitest';
import { findElements, stripElements, findFlowCategory, findNegations, findNumberFilter, findOrdinal, findPatterns, findStates, findStyles, findTopN, matchesNumber, sentenceForm, splitIntents, withoutNegations } from './guideParse';
import type { Pattern } from '../types';

describe('sentenceForm', () => {
  it.each([
    ['is swiggy on ios', 'yesno'],
    ['does it have flows?', 'yesno'],
    ['what platform is it on', 'wh'],
    ['which app has the most screens', 'wh'],
    ['swiggy flows?', 'wh'],
    ['how many screens does it have', 'count'],
    ['open swiggy', 'command'],
    ['how about zomato', 'command'],
  ] as const)('%s → %s', (text, form) => {
    expect(sentenceForm(text)).toBe(form);
  });
});

describe('findStates', () => {
  it.each([
    ['empty states', ['empty']],
    ['show me empty state screens', ['empty']],
    ['bottom sheets in zomato', ['bottom-sheet']],
    ['toasts and snackbars', ['toast']],
    ['loading skeletons', ['loading']],
    ['loading login screens', ['loading']],
    ['empty checkout screens', ['empty']],
    ['error states', ['error']],
    ['modals', ['modal']],
    ['dialogs with a coach mark', ['coach-mark', 'modal']],
    ['permission prompts', ['permission']],
  ])('%s', (text, states) => {
    expect(findStates(text).sort()).toEqual([...states].sort());
  });

  it('leaves ordinary sentences alone', () => {
    expect(findStates('open swiggy')).toEqual([]);
    expect(findStates('is the library empty')).toEqual([]);
    expect(findStates('an error occurred')).toEqual([]);
  });
});

describe('findStyles', () => {
  it.each([
    ['dark mode screens', ['dark']],
    ['dark theme ui', ['dark']],
    ['minimalist apps', ['minimal']],
    ['light mode', ['light']],
    ['bold typography', ['bold']],
    ['playful onboarding', ['playful']],
  ])('%s', (text, styles) => {
    expect(findStyles(text)).toEqual(styles);
  });

  it('does not read a plain adjective as a style', () => {
    expect(findStyles('a light snack')).toEqual([]);
    expect(findStyles('bold claim')).toEqual([]);
    expect(findStyles('after dark')).toEqual([]);
  });
});

describe('findElements', () => {
  const kinds = ['nav-bar', 'tab-bar', 'search-bar', 'text-field', 'cta', 'chip', 'bottom-sheet', 'toast', 'button', 'list', 'price', 'carousel'];

  it.each([
    ['bottom sheets', ['bottom-sheet']],
    ['show me nav bars', ['nav-bar']],
    ['navigation bar examples', ['nav-bar']],
    ['tab bars in swiggy', ['tab-bar']],
    ['bottom navigation', ['tab-bar']],
    ['search box', ['search-bar']],
    ['text inputs', ['text-field']],
    ['call to action buttons', ['cta', 'button']],
    ['filter chips', ['chip']],
    ['carousels', ['carousel']],
    ['btn', ['button']],
    ['primary btns', ['button']],
  ])('%s', (text, expected) => {
    expect(findElements(text, kinds).sort()).toEqual([...expected].sort());
  });

  it('only returns kinds the library has', () => {
    expect(findElements('bottom sheets', ['button'])).toEqual([]);
  });

  it('leaves unrelated text alone', () => {
    expect(findElements('open swiggy', kinds)).toEqual([]);
  });
});

describe('findPatterns', () => {
  const patterns = [
    { id: 'p1', slug: 'filter-chips', name: 'Filter chips', category: 'Filters', description: '', tags: [], screenIds: [] },
    { id: 'p2', slug: 'search-results', name: 'Search results', category: 'Search', description: '', tags: [], screenIds: [] },
    { id: 'p3', slug: 'tab-bar-nav', name: 'Tab bar navigation', category: 'Bottom Navigation', description: '', tags: [], screenIds: [] },
  ] as unknown as Pattern[];

  it('matches by name, singular or plural', () => {
    expect(findPatterns('show filter chips', patterns).map((p) => p.slug)).toEqual(['filter-chips']);
    expect(findPatterns('the filter chip pattern', patterns).map((p) => p.slug)).toEqual(['filter-chips']);
  });

  it('matches a whole category when patterns are asked for', () => {
    expect(findPatterns('bottom navigation patterns', patterns).map((p) => p.slug)).toEqual(['tab-bar-nav']);
    expect(findPatterns('search patterns', patterns).map((p) => p.slug)).toEqual(['search-results']);
  });

  it('does not treat a category word alone as a pattern', () => {
    expect(findPatterns('search', patterns)).toEqual([]);
  });
});

describe('findFlowCategory', () => {
  const categories = ['authentication', 'checkout', 'onboarding', 'search', 'settings', 'creation', 'discovery'];

  it.each([
    ['login flows', 'authentication'],
    ['sign up flow', 'authentication'],
    ['checkout flows', 'checkout'],
    ['payment flow in swiggy', 'checkout'],
    ['onboarding flows', 'onboarding'],
    ['search flows', 'search'],
  ])('%s → %s', (text, category) => {
    expect(findFlowCategory(text, categories)).toBe(category);
  });

  it('needs the word flow, and a category the library has', () => {
    expect(findFlowCategory('login screens', categories)).toBeNull();
    expect(findFlowCategory('checkout flows', ['onboarding'])).toBeNull();
  });
});

describe('negation', () => {
  it('finds what is ruled out', () => {
    expect(findNegations('apps except swiggy')).toEqual(['swiggy']);
    expect(findNegations('web apps other than linkedin')).toEqual(['linkedin']);
    expect(findNegations('all apps but not zomato')).toEqual(['zomato']);
    expect(findNegations('not swiggy, zomato')).toEqual(['swiggy']);
  });

  it('leaves the wanted part', () => {
    expect(withoutNegations('apps except swiggy')).toBe('apps');
    expect(withoutNegations('not swiggy, zomato')).toBe('zomato');
    expect(withoutNegations('web apps other than linkedin')).toBe('web apps');
  });

  it('reads a platform ruled out', () => {
    expect(findNegations('apps that are not on web')).toEqual(['web']);
    expect(withoutNegations('apps that are not on web')).toBe('apps');
    expect(findNegations("apps that aren't on ios")).toEqual(['ios']);
  });

  it('finds nothing in a plain sentence', () => {
    expect(findNegations('open swiggy')).toEqual([]);
    expect(withoutNegations('open swiggy')).toBe('open swiggy');
  });
});

describe('numbers', () => {
  it.each([
    ['apps with more than 100 screens', { field: 'screens', op: 'gt', value: 100 }],
    ['apps with over 50 flows', { field: 'flows', op: 'gt', value: 50 }],
    ['at least 20 flows', { field: 'flows', op: 'gte', value: 20 }],
    ['fewer than 30 screens', { field: 'screens', op: 'lt', value: 30 }],
    ['under ten screens', { field: 'screens', op: 'lt', value: 10 }],
    ['100+ screens', { field: 'screens', op: 'gte', value: 100 }],
    ['rating above 4', { field: 'rating', op: 'gt', value: 4 }],
    ['rated at least 4.5', { field: 'rating', op: 'gte', value: 4.5 }],
    ['apps with 1,000 screens', { field: 'screens', op: 'eq', value: 1000 }],
  ])('%s', (text, expected) => {
    expect(findNumberFilter(text)).toEqual(expected);
  });

  it('finds nothing without a unit', () => {
    expect(findNumberFilter('more than 100')).toBeNull();
    expect(findNumberFilter('open swiggy')).toBeNull();
  });

  it('compares correctly', () => {
    expect(matchesNumber(262, { field: 'screens', op: 'gt', value: 100 })).toBe(true);
    expect(matchesNumber(90, { field: 'screens', op: 'gt', value: 100 })).toBe(false);
    expect(matchesNumber(null, { field: 'rating', op: 'gte', value: 4 })).toBe(false);
    expect(matchesNumber(4, { field: 'rating', op: 'gte', value: 4 })).toBe(true);
  });

  it.each([
    ['top 3 apps', 3],
    ['top three apps by flows', 3],
    ['the 5 biggest apps', 5],
    ['first 2', 2],
    ['which app has the most screens', null],
  ])('top n: %s', (text, n) => {
    expect(findTopN(text)).toBe(n);
  });
});

describe('findOrdinal', () => {
  it.each([
    ['the second one', { kind: 'index', index: 1 }],
    ['first', { kind: 'index', index: 0 }],
    ['open the third app', { kind: 'index', index: 2 }],
    ['2', { kind: 'index', index: 1 }],
    ['the last one', { kind: 'last' }],
    ['the other one', { kind: 'other' }],
    ['both', { kind: 'both' }],
    ['compare both', { kind: 'both' }],
    ['all of them', { kind: 'all' }],
  ])('%s', (text, expected) => {
    expect(findOrdinal(text)).toEqual(expected);
  });

  it('ignores ordinary sentences', () => {
    expect(findOrdinal('open swiggy')).toBeNull();
    expect(findOrdinal('how many screens does it have')).toBeNull();
    expect(findOrdinal('all apps')).toBeNull();
  });
});

describe('splitIntents', () => {
  it('splits a two-part request in order', () => {
    expect(splitIntents('open zomato and show its flows')).toEqual(['open zomato', 'show its flows']);
    expect(splitIntents('open swiggy, then how many screens does it have')).toEqual(['open swiggy', 'how many screens does it have']);
    expect(splitIntents('go to flows and then open zomato')).toEqual(['go to flows', 'open zomato']);
  });

  it('keeps an "and" that is not a second request', () => {
    expect(splitIntents('compare swiggy and zomato')).toEqual(['compare swiggy and zomato']);
    expect(splitIntents('how many screens and flows in swiggy')).toEqual(['how many screens and flows in swiggy']);
  });

  it('caps at three parts', () => {
    expect(splitIntents('open a, then open b, then open c, then open d')).toHaveLength(3);
  });
});

describe('stripElements', () => {
  it('takes the named components out, so a screen type inside one is not read twice', () => {
    expect(stripElements('screens with search bar', ['search-bar'])).toBe('screens with');
    expect(stripElements('show me nav bars and tab bars', ['nav-bar', 'tab-bar'])).toBe('show me and');
    expect(stripElements('login screens', [])).toBe('login screens');
  });
});
