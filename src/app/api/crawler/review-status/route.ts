import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
  const app = params.get('app') ?? '';
  const platform = params.get('platform') ?? 'ios';
  const version = params.get('version') ?? '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(app) || !['ios', 'webapp', 'web'].includes(platform) || !/^\d{4}-\d{2}-\d{2}$/.test(version)) return fail('app, platform and version are required.', 400);
  // The library's data folder, as the crawler finds it.
  const dataDir = process.env.INSPIRATIONS_DATA_DIR ? resolve(process.env.INSPIRATIONS_DATA_DIR) : resolve(process.cwd(), '..', 'motvin-backend', 'data', 'inspirations');
  const file = join(dataDir, '..', 'reviews', `${app}-${platform}-${version}`, 'reviewed.json');
  if (!existsSync(file)) return Response.json({ reviewed: false }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const status = JSON.parse(readFileSync(file, 'utf-8')) as { reviewedAt?: string; fixes?: number; rulesAdded?: number };
    return Response.json({ reviewed: true, reviewedAt: status.reviewedAt ?? null, fixes: status.fixes ?? 0, rulesAdded: status.rulesAdded ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ reviewed: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
