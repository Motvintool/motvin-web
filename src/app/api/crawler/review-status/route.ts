import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fail, verifyAdmin } from '@/lib/server/adminAuth';

/**
 * GET /api/crawler/review-status?app=&platform=&version= — whether Claude
 * has reviewed one upload: `{ reviewed: false }`, or when and how many fixes
 * it made (the `reviewed.json` its applied review leaves in the package).
 */
export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const params = new URL(request.url).searchParams;
  // ?all=1 — every upload Claude has reviewed (the library's own list), for the "Not reviewed" labels.
  if (params.get('all') === '1') {
    const libraryDir = process.env.INSPIRATIONS_DATA_DIR ? resolve(process.env.INSPIRATIONS_DATA_DIR) : resolve(process.cwd(), '..', 'motvin-backend', 'data', 'inspirations');
    let marks: Record<string, unknown> = {};
    try {
      marks = JSON.parse(readFileSync(join(libraryDir, 'reviewed.json'), 'utf-8')) as Record<string, unknown>;
    } catch {
      // None yet.
    }
    return Response.json({ reviewed: Object.keys(marks) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const app = params.get('app') ?? '';
  const platform = params.get('platform') ?? 'ios';
  const version = params.get('version') ?? '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(app) || !['ios', 'webapp', 'web'].includes(platform) || !/^\d{4}-\d{2}-\d{2}$/.test(version)) return fail('app, platform and version are required.', 400);
  // The library's data folder, as the crawler finds it.
  const dataDir = process.env.INSPIRATIONS_DATA_DIR ? resolve(process.env.INSPIRATIONS_DATA_DIR) : resolve(process.cwd(), '..', 'motvin-backend', 'data', 'inspirations');
  const file = join(dataDir, '..', 'reviews', `${app}-${platform}-${version}`, 'reviewed.json');
  // A review under way: started by review-pack, ended by the review's last pass.
  const reviewing = join(dirname(file), 'reviewing.json');
  if (existsSync(reviewing)) {
    try {
      const started = JSON.parse(readFileSync(reviewing, 'utf-8')) as { startedAt?: string; step?: number };
      return Response.json({ reviewed: false, reviewing: true, startedAt: started.startedAt ?? null, step: typeof started.step === 'number' ? started.step : 3, problems: [] }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      // A half-written mark: carry on as if none.
    }
  }
  // A review whose folder the admin deleted once happy: the library's own list still holds the mark.
  if (!existsSync(file)) {
    try {
      const marks = JSON.parse(readFileSync(join(dataDir, 'reviewed.json'), 'utf-8')) as Record<string, { reviewedAt?: string; fixes?: number }>;
      const mark = marks[`${app}-${platform}-${version}`];
      if (mark) return Response.json({ reviewed: true, reviewedAt: mark.reviewedAt ?? null, fixes: mark.fixes ?? 0, rulesAdded: 0, problems: [], hasBackup: false }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      // No list yet.
    }
  }
  if (!existsSync(file)) {
    // Not reviewed yet: what the automatic check already finds in the upload's package, so the admin sees it at once.
    let problems: string[] = [];
    try {
      const pack = JSON.parse(readFileSync(join(dirname(file), 'screens.json'), 'utf-8')) as { problems?: string[] };
      problems = Array.isArray(pack.problems) ? pack.problems : [];
    } catch {
      // No package yet.
    }
    return Response.json({ reviewed: false, problems }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const status = JSON.parse(readFileSync(file, 'utf-8')) as { reviewedAt?: string; fixes?: number; rulesAdded?: number; problems?: string[] };
    const hasBackup = readdirSync(dirname(file)).some((entry) => entry.startsWith('backup-'));
    return Response.json({ reviewed: true, reviewedAt: status.reviewedAt ?? null, fixes: status.fixes ?? 0, rulesAdded: status.rulesAdded ?? 0, problems: Array.isArray(status.problems) ? status.problems : [], hasBackup }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ reviewed: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

/**
 * DELETE /api/crawler/review-status?app=&platform=&version= — the admin is
 * happy with the review: its whole folder — the backup of the screens as they
 * were before it, and the rest — is removed. The review can no longer be
 * undone; the "Reviewed by Claude" mark stays in the library's own list.
 */
export async function DELETE(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const params = new URL(request.url).searchParams;
  const app = params.get('app') ?? '';
  const platform = params.get('platform') ?? 'ios';
  const version = params.get('version') ?? '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(app) || !['ios', 'webapp', 'web'].includes(platform) || !/^\d{4}-\d{2}-\d{2}$/.test(version)) return fail('app, platform and version are required.', 400);
  const dataDir = process.env.INSPIRATIONS_DATA_DIR ? resolve(process.env.INSPIRATIONS_DATA_DIR) : resolve(process.cwd(), '..', 'motvin-backend', 'data', 'inspirations');
  const dir = join(dataDir, '..', 'reviews', `${app}-${platform}-${version}`);
  if (!existsSync(join(dir, 'reviewed.json'))) return fail('This upload has not been reviewed.', 400);
  // The mark is kept in the library's own list first, so "Reviewed by Claude" stays; then the whole folder goes.
  const marksFile = join(dataDir, 'reviewed.json');
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
  const removed = 1;
  return Response.json({ success: true, removed }, { headers: { 'Cache-Control': 'no-store' } });
}
