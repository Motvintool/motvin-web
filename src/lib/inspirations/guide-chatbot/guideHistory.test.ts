import { describe, expect, it } from 'vitest';
import { groupChats, MAX_CHATS, MAX_LINES, parseHistory, previewOf, relativeTime, removeChat, titleOf, upsertChat, type SavedChat, type SavedLine } from './guideHistory';

const user = (id: number, text: string): SavedLine => ({ id, role: 'user', text });
const bot = (id: number, text: string): SavedLine => ({ id, role: 'assistant', text });
const chat = (id: string, lines: SavedLine[], appId: string | null = null) => ({ id, lines, appId });

describe('titleOf', () => {
  it('uses the first thing the visitor said', () => {
    expect(titleOf([bot(1, 'Hi'), user(2, 'how many screens does swiggy have')])).toBe('how many screens does swiggy have');
  });

  it('collapses whitespace and shortens a long one', () => {
    expect(titleOf([user(1, '  open   swiggy ')])).toBe('open swiggy');
    const long = titleOf([user(1, 'x'.repeat(200))]);
    expect(long).toHaveLength(58);
    expect(long.endsWith('…')).toBe(true);
  });

  it('falls back when nobody has spoken yet', () => {
    expect(titleOf([bot(1, 'Hi')])).toBe('New chat');
  });
});

describe('upsertChat', () => {
  it('adds a new chat at the front', () => {
    const first = upsertChat([], chat('a', [user(1, 'one')]), 100);
    const second = upsertChat(first, chat('b', [user(1, 'two')]), 200);
    expect(second.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('moves an updated chat to the front and keeps its first title', () => {
    let history = upsertChat([], chat('a', [user(1, 'first question')]), 100);
    history = upsertChat(history, chat('b', [user(1, 'other')]), 200);
    history = upsertChat(history, chat('a', [user(1, 'first question'), bot(2, 'answer'), user(3, 'follow up')]), 300);
    expect(history.map((c) => c.id)).toEqual(['a', 'b']);
    expect(history[0].title).toBe('first question');
    expect(history[0].updatedAt).toBe(300);
  });

  it('leaves a chat that has nothing new where it is', () => {
    let history = upsertChat([], chat('a', [user(1, 'one')]), 100);
    history = upsertChat(history, chat('b', [user(1, 'two')]), 200);
    const again = upsertChat(history, chat('a', [user(1, 'one')]), 999);
    expect(again).toBe(history);
    expect(again.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('keeps only the newest chats and the newest lines of each', () => {
    let history: SavedChat[] = [];
    for (let i = 0; i < MAX_CHATS + 5; i++) history = upsertChat(history, chat(`c${i}`, [user(1, `q${i}`)]), i);
    expect(history).toHaveLength(MAX_CHATS);
    expect(history[0].id).toBe(`c${MAX_CHATS + 4}`);
    const many = Array.from({ length: MAX_LINES + 10 }, (_, i) => user(i, `m${i}`));
    expect(upsertChat([], chat('x', many), 1)[0].lines).toHaveLength(MAX_LINES);
  });
});

describe('removeChat', () => {
  it('drops one chat', () => {
    const history = upsertChat(upsertChat([], chat('a', [user(1, 'one')]), 1), chat('b', [user(1, 'two')]), 2);
    expect(removeChat(history, 'a').map((c) => c.id)).toEqual(['b']);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-06T12:00:00').getTime();
  it.each([
    [now - 5_000, 'Just now'],
    [now - 5 * 60_000, '5 min ago'],
    [now - 3 * 3_600_000, '3 h ago'],
    [now - 30 * 3_600_000, 'Yesterday'],
    [now - 4 * 86_400_000, '4 days ago'],
  ])('%#', (then, expected) => expect(relativeTime(then, now)).toBe(expected));

  it('shows a date after a week', () => {
    expect(relativeTime(now - 20 * 86_400_000, now)).not.toMatch(/ago|Yesterday|Just now/);
  });
});

describe('parseHistory (browser storage is untrusted)', () => {
  const good = { id: 'a', title: 'open swiggy', updatedAt: 5, appId: 'a1', lines: [{ id: 1, role: 'user', text: 'open swiggy' }, { id: 2, role: 'assistant', text: 'Here’s Swiggy.', opened: { label: 'Swiggy', hint: 'App', href: '/inspirations/app/swiggy' } }] };

  it('reads back what was saved', () => {
    const [read] = parseHistory(JSON.stringify([good]));
    expect(read.title).toBe('open swiggy');
    expect(read.appId).toBe('a1');
    expect(read.lines[1].opened?.href).toBe('/inspirations/app/swiggy');
  });

  it('returns nothing for empty, broken or wrongly shaped storage', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory('not json')).toEqual([]);
    expect(parseHistory('{"a":1}')).toEqual([]);
    expect(parseHistory(JSON.stringify([{ id: 5 }, null, 'x', { ...good, lines: [] }]))).toEqual([]);
  });

  it('drops links that leave the site', () => {
    const tampered = { ...good, lines: [{ id: 1, role: 'assistant', text: 'x', opened: { label: 'a', hint: 'b', href: 'javascript:alert(1)' }, targets: [{ label: 'a', hint: 'b', href: 'https://evil.example' }, { label: 'c', hint: 'd', href: '//evil.example' }, { label: 'ok', hint: 'p', href: '/inspirations/apps' }, { label: 'ask', hint: 'q', href: '', ask: 'how many screens' }], card: { title: 't', facts: ['1'], href: 'https://evil.example' } }] };
    const [read] = parseHistory(JSON.stringify([tampered]));
    const line = read.lines[0];
    expect(line.opened).toBeUndefined();
    expect(line.targets?.map((t) => t.label)).toEqual(['ok', 'ask']);
    expect(line.card?.href).toBeUndefined();
  });

  it('sorts newest first and caps the list', () => {
    const many = Array.from({ length: MAX_CHATS + 4 }, (_, i) => ({ ...good, id: `c${i}`, updatedAt: i }));
    const read = parseHistory(JSON.stringify(many));
    expect(read).toHaveLength(MAX_CHATS);
    expect(read[0].updatedAt).toBeGreaterThan(read[1].updatedAt);
  });
});

describe('groupChats', () => {
  const now = new Date('2026-10-06T15:00:00').getTime();
  const at = (iso: string): SavedChat => ({ id: iso, title: iso, updatedAt: new Date(iso).getTime(), appId: null, lines: [user(1, 'x')] });

  it('splits into today, yesterday and earlier, newest first within each', () => {
    const groups = groupChats([at('2026-10-06T14:00:00'), at('2026-10-06T00:00:00'), at('2026-10-05T23:59:00'), at('2026-10-05T01:00:00'), at('2026-09-30T10:00:00')], now);
    expect(groups.map((g) => [g.label, g.chats.length])).toEqual([['Today', 2], ['Yesterday', 2], ['Earlier', 1]]);
    expect(groups[0].chats.map((c) => c.id)).toEqual(['2026-10-06T14:00:00', '2026-10-06T00:00:00']);
  });

  it('leaves out groups with nothing in them', () => {
    expect(groupChats([at('2026-09-01T10:00:00')], now).map((g) => g.label)).toEqual(['Earlier']);
    expect(groupChats([], now)).toEqual([]);
  });
});

describe('previewOf', () => {
  const chatWith = (lines: SavedLine[]): SavedChat => ({ id: 'a', title: 't', updatedAt: 1, appId: null, lines });

  it('is the guide’s last reply', () => {
    expect(previewOf(chatWith([user(1, 'open swiggy'), bot(2, 'Here’s Swiggy.'), user(3, 'flows'), bot(4, 'Opening Swiggy’s flows.')]))).toBe('Opening Swiggy’s flows.');
  });

  it('skips empty replies and a trailing question, and shortens a long reply', () => {
    expect(previewOf(chatWith([bot(1, 'Hello'), bot(2, '   '), user(3, 'hi')]))).toBe('Hello');
    expect(previewOf(chatWith([user(1, 'hi')]))).toBe('');
    const long = previewOf(chatWith([bot(1, 'word '.repeat(60))]));
    expect(long.length).toBe(88);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('saved logos', () => {
  it('keeps a web address for an image but drops anything else', () => {
    const base = { id: 'a', title: 't', updatedAt: 1, appId: null };
    const line = (iconSrc: string) => ({ id: 1, role: 'assistant', text: 'x', opened: { label: 'a', hint: 'b', href: '/inspirations/app/a', iconSrc } });
    const read = (iconSrc: string) => parseHistory(JSON.stringify([{ ...base, lines: [line(iconSrc)] }]))[0].lines[0].opened?.iconSrc;
    expect(read('http://localhost:3000/api/inspirations/logos/swiggy.png')).toBe('http://localhost:3000/api/inspirations/logos/swiggy.png');
    expect(read('https://api.motvin.com/logos/x.webp')).toBe('https://api.motvin.com/logos/x.webp');
    expect(read('/ASSET/logo.svg')).toBe('/ASSET/logo.svg');
    expect(read('javascript:alert(1)')).toBeUndefined();
    expect(read('data:image/svg+xml;base64,AAAA')).toBeUndefined();
  });
});
