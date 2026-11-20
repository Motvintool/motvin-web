import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actionFromHref, pillHref, readLibraryMisses, recordLibraryMiss } from './history';

describe('library buddy history: pills survive a reopened chat', () => {
  it('a search here and a move elsewhere both round-trip through their link', () => {
    const here = { type: 'params' as const, patch: { query: 'bell', styles: ['solid'], sources: ['phosphor'] } };
    expect(pillHref('icons', here)).toBe('/icons?q=bell&sources=phosphor&styles=solid');
    expect(actionFromHref('/icons?q=bell&sources=phosphor&styles=solid', 'icons')).toEqual({
      type: 'params',
      patch: { query: 'bell', sources: ['phosphor'], styles: ['solid'], categories: [], licenses: [] },
    });
    const move = { type: 'library' as const, category: 'logos' as const, patch: { query: 'amazon' } };
    expect(pillHref('icons', move)).toBe('/logos?q=amazon');
    expect(actionFromHref('/logos?q=amazon', 'icons')).toMatchObject({ type: 'library', category: 'logos', patch: { query: 'amazon' } });
  });

  it('ignores anything that is not a library page', () => {
    expect(actionFromHref('/inspirations?q=x', 'icons')).toBeNull();
    expect(actionFromHref('https://evil.example/icons', 'icons')).toBeNull();
  });
});

describe('library buddy history: misses stay in this browser', () => {
  // Tests run without a browser: a plain in-memory storage stands in.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    });
  });

  it('records what found nothing, clipped and capped', () => {
    recordLibraryMiss({ library: 'icons', question: '  zzqx   blorp ', answer: 'none', kind: 'empty' }, 1);
    expect(readLibraryMisses()).toEqual([{ library: 'icons', question: 'zzqx blorp', answer: 'none', kind: 'empty', at: 1 }]);
    for (let i = 0; i < 310; i++) recordLibraryMiss({ library: 'icons', question: `q${i}`, answer: 'a', kind: 'fallback' }, i);
    expect(readLibraryMisses()).toHaveLength(300);
  });
});
