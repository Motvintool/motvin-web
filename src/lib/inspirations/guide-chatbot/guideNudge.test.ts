import { afterEach, describe, expect, it, vi } from 'vitest';
import { NUDGE_KEY, NUDGE_MAX, nextNudge, nudgeMessages, readNudgeState, writeNudgeState } from './guideNudge';

describe('nudgeMessages', () => {
  it('has several different things to say', () => {
    const messages = nudgeMessages('Swiggy');
    expect(messages.length).toBeGreaterThanOrEqual(NUDGE_MAX);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('mentions a real app when it has one, and falls back when it does not', () => {
    expect(nudgeMessages('Swiggy').some((m) => m.includes('Swiggy'))).toBe(true);
    expect(nudgeMessages(null).some((m) => /undefined|null/.test(m))).toBe(false);
    expect(nudgeMessages().length).toBe(nudgeMessages('Swiggy').length);
  });
});

describe('nextNudge', () => {
  const messages = nudgeMessages('Swiggy');

  it('goes through the messages in order', () => {
    expect(nextNudge({ shown: 0, dismissed: false }, messages)).toBe(messages[0]);
    expect(nextNudge({ shown: 1, dismissed: false }, messages)).toBe(messages[1]);
    expect(nextNudge({ shown: 2, dismissed: false }, messages)).toBe(messages[2]);
  });

  it('stops after the limit for a visit', () => {
    expect(nextNudge({ shown: NUDGE_MAX, dismissed: false }, messages)).toBeNull();
    expect(nextNudge({ shown: NUDGE_MAX + 3, dismissed: false }, messages)).toBeNull();
  });

  it('stops for good once dismissed', () => {
    expect(nextNudge({ shown: 0, dismissed: true }, messages)).toBeNull();
  });

  it('says nothing when there is nothing to say', () => {
    expect(nextNudge({ shown: 0, dismissed: false }, [])).toBeNull();
  });
});

describe('the saved state', () => {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it('starts fresh and remembers progress', () => {
    vi.stubGlobal('sessionStorage', fakeStorage);
    expect(readNudgeState()).toEqual({ shown: 0, dismissed: false });
    writeNudgeState({ shown: 2, dismissed: false });
    expect(readNudgeState()).toEqual({ shown: 2, dismissed: false });
    writeNudgeState({ shown: 2, dismissed: true });
    expect(readNudgeState().dismissed).toBe(true);
  });

  it('ignores damaged or odd saved values', () => {
    vi.stubGlobal('sessionStorage', fakeStorage);
    store.set(NUDGE_KEY, 'not json');
    expect(readNudgeState()).toEqual({ shown: NUDGE_MAX, dismissed: true });
    store.set(NUDGE_KEY, JSON.stringify({ shown: -5, dismissed: 'yes' }));
    expect(readNudgeState()).toEqual({ shown: 0, dismissed: false });
    store.set(NUDGE_KEY, JSON.stringify('x'));
    expect(readNudgeState()).toEqual({ shown: 0, dismissed: false });
  });

  it('stays quiet when storage is blocked', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readNudgeState().dismissed).toBe(true);
    expect(() => writeNudgeState({ shown: 1, dismissed: false })).not.toThrow();
  });
});
