import type { NavCard, NavTarget } from './navAssistant';

/**
 * The guide's saved conversations, kept in this browser only. Nothing is sent
 * anywhere, and what is read back is treated as untrusted: shaped, capped, and
 * any link that is not a path inside this site is dropped.
 */

export type SavedLine = { id: number; role: 'user' | 'assistant'; text: string; targets?: NavTarget[]; card?: NavCard; opened?: NavTarget; error?: boolean };
export type SavedChat = { id: string; title: string; updatedAt: number; appId: string | null; lines: SavedLine[] };

export const HISTORY_KEY = 'motvin-guide-history';
export const MAX_CHATS = 20;
export const MAX_LINES = 60;

export function newChatId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleOf(lines: SavedLine[]): string {
  const first = lines.find((line) => line.role === 'user');
  const text = (first?.text ?? 'New chat').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** Adds or updates a chat and moves it to the front. A chat with nothing new keeps its place. */
export function upsertChat(history: SavedChat[], chat: { id: string; lines: SavedLine[]; appId: string | null }, now: number): SavedChat[] {
  const existing = history.find((candidate) => candidate.id === chat.id);
  const lines = chat.lines.slice(-MAX_LINES);
  if (existing && existing.lines.length === lines.length && existing.appId === chat.appId) return history;
  const next: SavedChat = { id: chat.id, title: existing?.title ?? titleOf(lines), updatedAt: now, appId: chat.appId, lines };
  return [next, ...history.filter((candidate) => candidate.id !== chat.id)].slice(0, MAX_CHATS);
}

export const removeChat = (history: SavedChat[], id: string) => history.filter((chat) => chat.id !== id);

export function relativeTime(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const insideSite = (href: unknown): href is string => typeof href === 'string' && /^\/(?!\/)/.test(href);
// An image may come from the library's own server, so a web address is fine there — it is only ever drawn, never followed.
const imageSrc = (value: unknown): value is string => insideSite(value) || (typeof value === 'string' && /^https?:\/\//i.test(value));

function cleanTarget(value: unknown): NavTarget | null {
  if (!value || typeof value !== 'object') return null;
  const target = value as Partial<NavTarget>;
  if (typeof target.label !== 'string' || typeof target.hint !== 'string') return null;
  const asks = typeof target.ask === 'string';
  if (!asks && !insideSite(target.href)) return null;
  return {
    label: target.label.slice(0, 120),
    hint: target.hint.slice(0, 120),
    href: asks ? '' : (target.href as string),
    ...(asks ? { ask: (target.ask as string).slice(0, 200) } : {}),
    ...(imageSrc(target.iconSrc) ? { iconSrc: target.iconSrc } : {}),
  };
}

function cleanLine(value: unknown): SavedLine | null {
  if (!value || typeof value !== 'object') return null;
  const line = value as Partial<SavedLine>;
  if (typeof line.id !== 'number' || (line.role !== 'user' && line.role !== 'assistant') || typeof line.text !== 'string') return null;
  const targets = Array.isArray(line.targets) ? line.targets.map(cleanTarget).filter((target): target is NavTarget => target !== null) : undefined;
  const opened = cleanTarget(line.opened) ?? undefined;
  const card =
    line.card && typeof line.card === 'object' && typeof line.card.title === 'string' && Array.isArray(line.card.facts)
      ? { title: line.card.title.slice(0, 120), facts: line.card.facts.filter((fact): fact is string => typeof fact === 'string').slice(0, 4), ...(insideSite(line.card.href) ? { href: line.card.href } : {}), ...(imageSrc(line.card.iconSrc) ? { iconSrc: line.card.iconSrc } : {}) }
      : undefined;
  return { id: line.id, role: line.role, text: line.text.slice(0, 600), ...(targets?.length ? { targets } : {}), ...(opened ? { opened } : {}), ...(card ? { card } : {}), ...(line.error ? { error: true } : {}) };
}

export function parseHistory(raw: string | null): SavedChat[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const chats: SavedChat[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const chat = item as Partial<SavedChat>;
      if (typeof chat.id !== 'string' || typeof chat.title !== 'string' || typeof chat.updatedAt !== 'number' || !Array.isArray(chat.lines)) continue;
      const lines = chat.lines.map(cleanLine).filter((line): line is SavedLine => line !== null).slice(-MAX_LINES);
      if (lines.length === 0) continue;
      chats.push({ id: chat.id, title: chat.title.slice(0, 80), updatedAt: chat.updatedAt, appId: typeof chat.appId === 'string' ? chat.appId : null, lines });
    }
    return chats.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

export function readHistory(): SavedChat[] {
  try {
    return parseHistory(localStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}

export function writeHistory(history: SavedChat[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked — the conversation still works, it just is not kept.
  }
}

export type ChatGroup = { label: 'Today' | 'Yesterday' | 'Earlier'; chats: SavedChat[] };

/** Chats grouped by the day they were last used, newest first, leaving out empty groups. */
export function groupChats(chats: SavedChat[], now: number): ChatGroup[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const startToday = today.getTime();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startYesterday = yesterday.getTime();
  const groups: ChatGroup[] = [
    { label: 'Today', chats: chats.filter((chat) => chat.updatedAt >= startToday) },
    { label: 'Yesterday', chats: chats.filter((chat) => chat.updatedAt >= startYesterday && chat.updatedAt < startToday) },
    { label: 'Earlier', chats: chats.filter((chat) => chat.updatedAt < startYesterday) },
  ];
  return groups.filter((group) => group.chats.length > 0);
}

/** The guide's last reply in a chat, trimmed to a line — what the chat ended on. */
export function previewOf(chat: SavedChat): string {
  for (let i = chat.lines.length - 1; i >= 0; i--) {
    const line = chat.lines[i];
    if (line.role !== 'assistant') continue;
    const text = line.text.replace(/\s+/g, ' ').trim();
    if (text) return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  }
  return '';
}
