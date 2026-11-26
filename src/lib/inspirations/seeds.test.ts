import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The API, controlled per test: a load can answer, fail, or never answer (a stalled API).
const api = vi.hoisted(() => ({
  getMeta: vi.fn(),
  listScreens: vi.fn(),
}));
vi.mock('./api', () => ({ inspirationsApi: api }));

const PAGE = { items: [{ id: 's1' }], total: 1, limit: 60, offset: 0, nextOffset: null };
const never = () => new Promise(() => {});

async function load() {
  vi.resetModules(); // a fresh seed cache per test
  return (await import('./seeds')).sectionSeeds;
}

describe('sectionSeeds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.getMeta.mockReset();
    api.listScreens.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('seeds a plain section address', async () => {
    api.getMeta.mockResolvedValue({ counts: {} });
    api.listScreens.mockResolvedValue(PAGE);
    const seeds = await (await load())('screens', {});
    expect(seeds['screens-feed']).toEqual(PAGE);
    expect(seeds['meta:ios']).toEqual({ counts: {} });
  });

  it('does not seed a filtered address', async () => {
    const seeds = await (await load())('screens', { type: 'login' });
    expect(seeds).toEqual({});
    expect(api.listScreens).not.toHaveBeenCalled();
  });

  it('does not hold the page for a stalled API: what is in by the deadline goes, the rest loads in the browser', async () => {
    api.getMeta.mockImplementation(never);
    api.listScreens.mockResolvedValue(PAGE);
    const pending = (await load())('screens', {});
    await vi.advanceTimersByTimeAsync(2_000);
    const seeds = await pending;
    expect(seeds['screens-feed']).toEqual(PAGE);
    expect(seeds).not.toHaveProperty('meta:ios');
  });

  it('gives up on a load the API never answers, so the next page view asks again', async () => {
    api.getMeta.mockImplementation(never);
    api.listScreens.mockResolvedValue(PAGE);
    const sectionSeeds = await load();
    const first = sectionSeeds('screens', {});
    await vi.advanceTimersByTimeAsync(8_000);
    await first;
    api.getMeta.mockResolvedValue({ counts: {} });
    const second = await sectionSeeds('screens', {});
    expect(second['meta:ios']).toEqual({ counts: {} });
    expect(api.getMeta).toHaveBeenCalledTimes(4); // meta:ios and meta:settings, twice each
  });

  it('keeps an answer for the next page views', async () => {
    api.getMeta.mockResolvedValue({ counts: {} });
    api.listScreens.mockResolvedValue(PAGE);
    const sectionSeeds = await load();
    await sectionSeeds('screens', {});
    await sectionSeeds('screens', {});
    expect(api.listScreens).toHaveBeenCalledTimes(1);
  });
});
