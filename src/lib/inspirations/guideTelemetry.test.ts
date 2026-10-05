import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLog, exportLog, LOG_KEY, MAX_ENTRIES, parseLog, readLog, recordFeedback, recordMiss, topMisses } from './guideTelemetry';

const store = new Map<string, string>();
const fakeStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };

beforeEach(() => vi.stubGlobal('localStorage', fakeStorage));
afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe('recording', () => {
  it('keeps misses and feedback, trimmed and capped', () => {
    recordMiss('  what   is   this  ', 'fallback', 'I’m a guide…', 1);
    recordFeedback('open swiggy', 'Opening Swiggy.', 'up', 2);
    const log = readLog();
    expect(log.misses).toEqual([{ at: 1, question: 'what is this', kind: 'fallback', answer: 'I’m a guide…' }]);
    expect(log.feedback).toEqual([{ at: 2, question: 'open swiggy', answer: 'Opening Swiggy.', verdict: 'up' }]);
  });

  it('a changed verdict replaces the earlier one', () => {
    recordFeedback('q', 'a', 'up', 1);
    recordFeedback('q', 'a', 'down', 2);
    expect(readLog().feedback).toEqual([{ at: 2, question: 'q', answer: 'a', verdict: 'down' }]);
  });

  it('never grows past the cap', () => {
    for (let i = 0; i < MAX_ENTRIES + 20; i++) recordMiss(`q${i}`, 'fallback', 'a', i);
    expect(readLog().misses).toHaveLength(MAX_ENTRIES);
    expect(readLog().misses[0].question).toBe('q20');
  });

  it('clears', () => {
    recordMiss('q', 'fallback', 'a');
    clearLog();
    expect(readLog()).toEqual({ misses: [], feedback: [] });
  });
});

describe('parseLog treats storage as untrusted', () => {
  it('drops broken shapes', () => {
    expect(parseLog(null)).toEqual({ misses: [], feedback: [] });
    expect(parseLog('nope')).toEqual({ misses: [], feedback: [] });
    expect(parseLog(JSON.stringify({ misses: [{ at: 'x' }, 5, null, { at: 1, question: 'q', kind: 'weird', answer: 'a' }], feedback: 'no' }))).toEqual({ misses: [], feedback: [] });
  });

  it('is quiet when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readLog()).toEqual({ misses: [], feedback: [] });
    expect(() => recordMiss('q', 'fallback', 'a')).not.toThrow();
    store.set(LOG_KEY, 'x');
  });
});

describe('the report', () => {
  it('ranks the most frequent misses first', () => {
    recordMiss('weather today', 'fallback', 'a', 1);
    recordMiss('Weather Today', 'fallback', 'a', 2);
    recordMiss('zzz', 'clarify', 'a', 3);
    expect(topMisses(readLog())).toEqual([
      { question: 'weather today', count: 2, kind: 'fallback' },
      { question: 'zzz', count: 1, kind: 'clarify' },
    ]);
  });

  it('exports totals, worst misses and thumbs-down as readable JSON', () => {
    recordMiss('weather', 'fallback', 'cannot', 1);
    recordFeedback('open swiggy', 'Opening Swiggy.', 'up', 2);
    recordFeedback('zomato rating', 'No one has rated Zomato yet.', 'down', 3);
    const report = JSON.parse(exportLog(readLog(), 4));
    expect(report.totals).toEqual({ misses: 1, feedback: 2, up: 1, down: 1 });
    expect(report.topMisses[0].question).toBe('weather');
    expect(report.thumbsDown).toEqual([{ question: 'zomato rating', answer: 'No one has rated Zomato yet.' }]);
    expect(report.exportedAt).toBe(new Date(4).toISOString());
  });
});
