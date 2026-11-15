import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The review package folders the crawler writes, read and cleared from the
 * web server: the same rules for the "Looks good — clean up" button and for a
 * batch that cleans up by itself.
 */

/** The library's data folder, as the crawler finds it. */
export function inspirationsDataDir(): string {
  return process.env.INSPIRATIONS_DATA_DIR ? resolve(process.env.INSPIRATIONS_DATA_DIR) : resolve(process.cwd(), '..', 'motvin-backend', 'data', 'inspirations');
}

export function reviewFolder(app: string, platform: string, version: string): string {
  return join(inspirationsDataDir(), '..', 'reviews', `${app}-${platform}-${version}`);
}

/** Where a review stands: under way, finished clean, finished with problems left, or not started. */
export function reviewState(app: string, platform: string, version: string): { reviewing: boolean; reviewed: boolean; problems: string[] } {
  const dir = reviewFolder(app, platform, version);
  if (existsSync(join(dir, 'reviewing.json'))) return { reviewing: true, reviewed: false, problems: [] };
  try {
    const status = JSON.parse(readFileSync(join(dir, 'reviewed.json'), 'utf-8')) as { problems?: string[] };
    return { reviewing: false, reviewed: true, problems: Array.isArray(status.problems) ? status.problems : [] };
  } catch {
    // Not reviewed here — the library's own list may still hold the mark of a folder already cleared.
  }
  try {
    const marks = JSON.parse(readFileSync(join(inspirationsDataDir(), 'reviewed.json'), 'utf-8')) as Record<string, unknown>;
    if (marks[`${app}-${platform}-${version}`]) return { reviewing: false, reviewed: true, problems: [] };
  } catch {
    // No list yet.
  }
  return { reviewing: false, reviewed: false, problems: [] };
}

/**
 * Removes a reviewed upload's whole review folder. The mark goes in the
 * library's own list first, so "Reviewed by agent" stays. False when the
 * upload has not been reviewed.
 */
export function clearReviewFolder(app: string, platform: string, version: string): boolean {
  const dir = reviewFolder(app, platform, version);
  if (!existsSync(join(dir, 'reviewed.json'))) return false;
  const marksFile = join(inspirationsDataDir(), 'reviewed.json');
  let marks: Record<string, unknown> = {};
  try {
    marks = JSON.parse(readFileSync(marksFile, 'utf-8')) as Record<string, unknown>;
  } catch {
    // A new list.
  }
  const status = JSON.parse(readFileSync(join(dir, 'reviewed.json'), 'utf-8')) as { reviewedAt?: string; fixes?: number };
  marks[`${app}-${platform}-${version}`] = { reviewedAt: status.reviewedAt ?? null, by: 'Claude', fixes: status.fixes ?? 0 };
  writeFileSync(marksFile, `${JSON.stringify(marks, null, 2)}\n`);
  rmSync(dir, { recursive: true, force: true });
  return true;
}
