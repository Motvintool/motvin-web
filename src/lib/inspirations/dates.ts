/**
 * A date's calendar day where the code is actually running, as `YYYY-MM-DD`
 * — client or server. `toISOString()` reports UTC, which is a different
 * calendar day from local "today" for several hours around local midnight
 * (IST, five and a half hours ahead, still sees UTC on yesterday's date
 * until 5:30am) — every "today" a version or a date default computes has to
 * use this, not toISOString, or it lands a calendar day early.
 */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-29" → "29 Sep 2026", the same label the backend gives a version. */
export function dayLabel(id: string): string {
  const [y, m, d] = id.split('-').map(Number);
  if (!y || !m || !d || !MONTHS[m - 1]) return id;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function monthIndex(word: string): number {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return MONTHS.findIndex((month) => w.startsWith(month.toLowerCase()));
}

/** A real calendar day, or null — built from parts, never via Date.parse (UTC). */
function build(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1970 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Every date written in some free text, in the order they appear, as
 * `YYYY-MM-DD` — "2026-09-30", "30/09/2026", "30 Sep 2026", "Sep 30, 2026",
 * "September 30" (this year), and the words "today"/"yesterday". Used
 * wherever the admin types or says a version's date rather than picking it.
 */
export function parseDatesIn(text: string, today: string = localDateString()): string[] {
  const found: { at: number; date: string }[] = [];
  const push = (at: number, date: string | null) => {
    if (date) found.push({ at, date });
  };
  const thisYear = Number(today.slice(0, 4));

  for (const m of text.matchAll(/\b(today|yesterday)\b/gi)) {
    if (m[1].toLowerCase() === 'today') push(m.index ?? 0, today);
    else {
      const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) - 1);
      push(m.index ?? 0, localDateString(d));
    }
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) push(m.index ?? 0, build(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) push(m.index ?? 0, build(+m[3], +m[2], +m[1]));
  // 30 Sep 2026 / 30th September / 30 Sep
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?(?:\s+(\d{4}))?\b/g)) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) push(m.index ?? 0, build(m[3] ? +m[3] : thisYear, mi + 1, +m[1]));
  }
  // Sep 30, 2026 / September 30
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?\b/g)) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) push(m.index ?? 0, build(m[3] ? +m[3] : thisYear, mi + 1, +m[2]));
  }

  return found.sort((a, b) => a.at - b.at).map((entry) => entry.date);
}

/** The first date written in some text, or null. */
export function parseDateInput(text: string, today: string = localDateString()): string | null {
  return parseDatesIn(text, today)[0] ?? null;
}
