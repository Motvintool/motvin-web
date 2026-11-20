import { parseHistory, type SavedChat } from '../../inspirations/guide-chatbot/guideHistory';
import type { LibraryParams } from '../../api/libraryParams';
import type { Category } from '@/lib/config/categories';

/**
 * The library Buddy's saved chats, in this browser only — the same shape and
 * rules as the Inspirations Buddy's (guideHistory.ts), under a key of their
 * own so the two lists never mix. `appId` holds the library the chat was in.
 */

export const LIBRARY_HISTORY_KEY = 'motvin-library-buddy-history';

export function readLibraryHistory(): SavedChat[] {
  try {
    return parseHistory(localStorage.getItem(LIBRARY_HISTORY_KEY));
  } catch {
    return [];
  }
}

export function writeLibraryHistory(history: SavedChat[]) {
  try {
    localStorage.setItem(LIBRARY_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked — the conversation still works, it just is not kept.
  }
}

// ---------------------------------------------------------------------------
// A saved answer's "See all" pill, as a link inside this site, so a chat
// reopened from history can still go back to what each answer showed. (Saved
// lines keep only links inside the site — guideHistory.ts drops anything else.)
// ---------------------------------------------------------------------------

type PillAction =
  | { type: 'params'; patch: Partial<LibraryParams> }
  | { type: 'library'; category: Category; patch?: Partial<LibraryParams> };

const LIBRARY_PATHS: readonly Category[] = ['icons', 'logos', 'illustrations'];
const LIST_KEYS = ['sources', 'styles', 'categories', 'licenses'] as const;

/** The page a pill leads to: /logos?q=amazon&styles=solid. */
export function pillHref(category: Category, action: PillAction): string {
  const target = action.type === 'library' ? action.category : category;
  const patch = action.patch ?? {};
  const search = new URLSearchParams();
  if (patch.query) search.set('q', patch.query);
  for (const key of LIST_KEYS) if (patch[key]?.length) search.set(key, patch[key]!.join(','));
  if (patch.sort && patch.sort !== 'all') search.set('sort', patch.sort);
  const qs = search.toString();
  return qs ? `/${target}?${qs}` : `/${target}`;
}

/** The pill's action again, read back from its link; null for anything that isn't a library page. */
export function actionFromHref(href: string, category: Category): PillAction | null {
  const match = /^\/(icons|logos|illustrations)(?:\?(.*))?$/.exec(href);
  if (!match || !LIBRARY_PATHS.includes(match[1] as Category)) return null;
  const search = new URLSearchParams(match[2] ?? '');
  const list = (key: string) => (search.get(key) ?? '').split(',').filter(Boolean);
  const patch: Partial<LibraryParams> = {
    query: search.get('q') ?? '',
    sources: list('sources'),
    styles: list('styles'),
    categories: list('categories'),
    licenses: list('licenses'),
    ...(search.get('sort') ? { sort: search.get('sort')! } : {}),
  };
  const target = match[1] as Category;
  return target === category ? { type: 'params', patch } : { type: 'library', category: target, patch };
}

// ---------------------------------------------------------------------------
// What Buddy couldn't find, kept in this browser only — as the Inspirations
// Buddy keeps its misses (guideTelemetry.ts) — so the words it knows can be
// improved from real questions. No server, no identity.
// ---------------------------------------------------------------------------

export const LIBRARY_LOG_KEY = 'motvin-library-buddy-log';
const MAX_MISSES = 300;

export type LibraryMiss = { at: number; library: Category; question: string; answer: string; kind: 'fallback' | 'clarify' | 'empty' };

export function readLibraryMisses(): LibraryMiss[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(LIBRARY_LOG_KEY) ?? '[]');
    return Array.isArray(data)
      ? data.filter((m): m is LibraryMiss => Boolean(m) && typeof m === 'object' && typeof m.at === 'number' && typeof m.question === 'string').slice(-MAX_MISSES)
      : [];
  } catch {
    return [];
  }
}

export function recordLibraryMiss(miss: Omit<LibraryMiss, 'at'>, now = Date.now()) {
  const clip = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 200);
  try {
    const next = [...readLibraryMisses(), { ...miss, at: now, question: clip(miss.question), answer: clip(miss.answer) }].slice(-MAX_MISSES);
    localStorage.setItem(LIBRARY_LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: nothing is kept, nothing breaks.
  }
}
