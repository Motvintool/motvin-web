import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  inspirationsApi: {
    listApps: vi.fn(),
    listFlows: vi.fn(),
    listPatterns: vi.fn(),
    listElements: vi.fn(),
    getMeta: vi.fn(),
  },
}));

import { inspirationsApi } from '../api';
import { appOfId, appsUsingPattern, buildVocabulary, loadIndex, makeIndex, resetIndex } from './guideIndex';
import type { App, Pattern } from '../types';

const apps = [
  { id: 'swiggy', name: 'Swiggy', slug: 'swiggy', screenCount: 1, flowCount: 1 },
  { id: 'swiggy-pro', name: 'Swiggy Pro', slug: 'swiggy-pro', screenCount: 1, flowCount: 1 },
  { id: 'zomato', name: 'Zomato', slug: 'zomato', screenCount: 1, flowCount: 1 },
] as unknown as App[];

afterEach(() => {
  resetIndex();
  vi.clearAllMocks();
});

describe('appOfId', () => {
  const index = makeIndex({ apps, flows: [], patterns: [], elements: [], meta: null, reachable: true });

  it('reads the app off the front of a screen id, preferring the longest slug', () => {
    expect(appOfId(index, 'swiggy-ios-versions-2026-10-03-searching-1')?.id).toBe('swiggy');
    expect(appOfId(index, 'swiggy-pro-ios-home-1')?.id).toBe('swiggy-pro');
    expect(appOfId(index, 'zomato')?.id).toBe('zomato');
    expect(appOfId(index, 'linkedin-web-1')).toBeNull();
  });

  it('lists the apps a pattern appears in, once each', () => {
    const pattern = { screenIds: ['swiggy-ios-a', 'swiggy-ios-b', 'zomato-ios-a', 'unknown-x'] } as Pattern;
    expect(appsUsingPattern(index, pattern).map((a) => a.id)).toEqual(['swiggy', 'zomato']);
  });
});

describe('buildVocabulary', () => {
  it('collects the names and taxonomy the library really has, five letters and up', () => {
    const vocabulary = buildVocabulary(apps, [{ name: 'Checkout' }] as never, [{ name: 'Filter chips' }] as never, [{ kind: 'bottom-sheet', count: 1 }], null);
    expect(vocabulary).toContain('swiggy');
    expect(vocabulary).toContain('zomato');
    expect(vocabulary).toContain('checkout');
    expect(vocabulary).toContain('filter');
    expect(vocabulary).toContain('chips');
    expect(vocabulary).toContain('bottom');
    expect(vocabulary).toContain('sheet');
    expect(vocabulary).not.toContain('pro');
  });

  it('leaves out everyday words, so they can never be "corrected" into', () => {
    const vocabulary = buildVocabulary([], [], [], [], null);
    for (const word of ['light', 'empty', 'error', 'search', 'price']) expect(vocabulary).not.toContain(word);
  });
});

describe('loadIndex', () => {
  it('loads every part and keeps the result warm', async () => {
    vi.mocked(inspirationsApi.listApps).mockResolvedValue(apps);
    vi.mocked(inspirationsApi.listFlows).mockResolvedValue([]);
    vi.mocked(inspirationsApi.listPatterns).mockResolvedValue([]);
    vi.mocked(inspirationsApi.listElements).mockResolvedValue([{ kind: 'toast', count: 3 }]);
    vi.mocked(inspirationsApi.getMeta).mockResolvedValue({ taxonomy: { flowCategories: ['checkout'] } } as never);
    const first = await loadIndex(1000);
    const second = await loadIndex(2000);
    expect(first).toBe(second);
    expect(inspirationsApi.listApps).toHaveBeenCalledTimes(1);
    expect(first.reachable).toBe(true);
    expect(first.elements).toEqual([{ kind: 'toast', count: 3 }]);
    expect(first.appBySlug.get('zomato')?.name).toBe('Zomato');
  });

  it('narrows rather than fails when one part is missing', async () => {
    vi.mocked(inspirationsApi.listApps).mockResolvedValue(apps);
    vi.mocked(inspirationsApi.listFlows).mockRejectedValue(new Error('down'));
    vi.mocked(inspirationsApi.listPatterns).mockResolvedValue([]);
    vi.mocked(inspirationsApi.listElements).mockResolvedValue([]);
    vi.mocked(inspirationsApi.getMeta).mockRejectedValue(new Error('down'));
    const index = await loadIndex();
    expect(index.reachable).toBe(true);
    expect(index.apps).toHaveLength(3);
    expect(index.flows).toEqual([]);
    expect(index.meta).toBeNull();
  });

  it('reports unreachable when the app list itself fails, and does not cache that', async () => {
    vi.mocked(inspirationsApi.listApps).mockRejectedValueOnce(new Error('offline'));
    expect((await loadIndex()).reachable).toBe(false);
    vi.mocked(inspirationsApi.listApps).mockResolvedValue(apps);
    vi.mocked(inspirationsApi.listFlows).mockResolvedValue([]);
    vi.mocked(inspirationsApi.listPatterns).mockResolvedValue([]);
    vi.mocked(inspirationsApi.listElements).mockResolvedValue([]);
    vi.mocked(inspirationsApi.getMeta).mockResolvedValue(null as never);
    expect((await loadIndex()).reachable).toBe(true);
  });
});
