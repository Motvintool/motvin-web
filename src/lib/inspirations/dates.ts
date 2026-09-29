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
