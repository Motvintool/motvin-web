/**
 * What the guide could not do, and what visitors thought of its answers — kept
 * in this browser only, so the rules can be improved from real questions. No
 * server, no identity: the question text, the kind of answer, a verdict.
 */

export type MissKind = 'fallback' | 'clarify' | 'error';
export type Verdict = 'up' | 'down';

export type MissEntry = { at: number; question: string; kind: MissKind; answer: string };
export type FeedbackEntry = { at: number; question: string; answer: string; verdict: Verdict };
export type GuideLog = { misses: MissEntry[]; feedback: FeedbackEntry[] };

export const LOG_KEY = 'motvin-guide-log';
export const MAX_ENTRIES = 300;

const EMPTY: GuideLog = { misses: [], feedback: [] };

const clip = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max);

export function parseLog(raw: string | null): GuideLog {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return EMPTY;
    const log = data as Partial<GuideLog>;
    const misses = Array.isArray(log.misses)
      ? log.misses
          .filter((m): m is MissEntry => Boolean(m) && typeof m === 'object' && typeof m.at === 'number' && typeof m.question === 'string' && typeof m.answer === 'string' && (m.kind === 'fallback' || m.kind === 'clarify' || m.kind === 'error'))
          .slice(-MAX_ENTRIES)
      : [];
    const feedback = Array.isArray(log.feedback)
      ? log.feedback.filter((f): f is FeedbackEntry => Boolean(f) && typeof f === 'object' && typeof f.at === 'number' && typeof f.question === 'string' && typeof f.answer === 'string' && (f.verdict === 'up' || f.verdict === 'down')).slice(-MAX_ENTRIES)
      : [];
    return { misses, feedback };
  } catch {
    return EMPTY;
  }
}

export function readLog(): GuideLog {
  try {
    return parseLog(localStorage.getItem(LOG_KEY));
  } catch {
    return EMPTY;
  }
}

function writeLog(log: GuideLog) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // Storage full or blocked — the guide still works, it just is not learning from this visit.
  }
}

export function recordMiss(question: string, kind: MissKind, answer: string, now = Date.now()) {
  const log = readLog();
  writeLog({ ...log, misses: [...log.misses, { at: now, question: clip(question, 200), kind, answer: clip(answer, 200) }].slice(-MAX_ENTRIES) });
}

export function recordFeedback(question: string, answer: string, verdict: Verdict, now = Date.now()) {
  const log = readLog();
  // A changed mind replaces the earlier verdict on the same answer.
  const others = log.feedback.filter((entry) => !(entry.question === clip(question, 200) && entry.answer === clip(answer, 200)));
  writeLog({ ...log, feedback: [...others, { at: now, question: clip(question, 200), answer: clip(answer, 200), verdict }].slice(-MAX_ENTRIES) });
}

export function clearLog() {
  writeLog(EMPTY);
}

/** The questions the guide most often could not answer, most frequent first — the to-do list for new rules. */
export function topMisses(log: GuideLog, limit = 20): { question: string; count: number; kind: MissKind }[] {
  const counts = new Map<string, { count: number; kind: MissKind }>();
  for (const miss of log.misses) {
    const key = miss.question.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, kind: miss.kind });
  }
  return [...counts.entries()]
    .map(([question, { count, kind }]) => ({ question, count, kind }))
    .sort((a, b) => b.count - a.count || a.question.localeCompare(b.question))
    .slice(0, limit);
}

/** A report a person can read or paste into an issue: totals, the worst misses, and every thumbs-down. */
export function exportLog(log: GuideLog, now = Date.now()): string {
  const ups = log.feedback.filter((entry) => entry.verdict === 'up').length;
  const downs = log.feedback.length - ups;
  return JSON.stringify(
    {
      exportedAt: new Date(now).toISOString(),
      totals: { misses: log.misses.length, feedback: log.feedback.length, up: ups, down: downs },
      topMisses: topMisses(log),
      thumbsDown: log.feedback.filter((entry) => entry.verdict === 'down').map(({ question, answer }) => ({ question, answer })),
      misses: log.misses,
    },
    null,
    2,
  );
}
