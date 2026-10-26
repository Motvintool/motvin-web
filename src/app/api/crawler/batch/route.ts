import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { batchFilesDir, claudeCli, controlBatch, createBatch, geminiCli, listBatches, recordsDir, startBatchRunner } from '@/lib/server/batch';
import type { BatchSettings } from '@/lib/server/batch';

/**
 * /api/crawler/batch — adding many apps at once.
 *
 * GET    every batch, newest last, and whether auto review can run here.
 * POST   a new batch: { settings, items: [{ title, video, ownsVideo, appId, detectIndustry, skip? }] }.
 *        The browser has already made each new app and set its logo; a video
 *        is a file in the records folder or one uploaded to the batch's own.
 * PATCH  ?id=&action=pause|resume|retry|skip|stop|clear[&item=]
 */

const inside = (path: string, root: string) => {
  const full = resolve(path);
  return full === root || full.startsWith(`${root}${sep}`);
};

export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  startBatchRunner();
  return Response.json({ batches: listBatches(), autoReview: Boolean(claudeCli()), reviewers: { claude: Boolean(claudeCli()), gemini: Boolean(geminiCli()) } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const body = (await request.json().catch(() => null)) as { settings?: Partial<BatchSettings>; items?: Array<Record<string, unknown>> } | null;
  if (!body?.settings || !Array.isArray(body.items) || !body.items.length) return fail('A batch needs its settings and at least one app.', 400);
  const raw = body.settings;
  const settings: BatchSettings = {
    cleanup: raw.cleanup === 'manual' ? 'manual' : 'automatic',
    review: raw.review === 'manual' ? 'manual' : 'auto',
    afterReview: raw.afterReview === 'keep' ? 'keep' : 'cleanup',
    platform: raw.platform === 'web' || raw.platform === 'webapp' ? raw.platform : 'ios',
    version: typeof raw.version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.version) ? raw.version : null,
    notify: raw.notify === 'summary' || raw.notify === 'off' ? raw.notify : 'each',
    appsAtOnce: raw.appsAtOnce === 1 || raw.appsAtOnce === 2 || raw.appsAtOnce === 4 ? raw.appsAtOnce : 3,
    reviewer: raw.reviewer === 'gemini' ? 'gemini' : 'claude',
    reviewModel: raw.reviewModel === 'opus' ? 'opus' : 'sonnet',
  };
  const records = recordsDir();
  const uploads = batchFilesDir();
  const items = [];
  for (const entry of body.items) {
    const video = typeof entry.video === 'string' ? entry.video : '';
    const ownsVideo = entry.ownsVideo === true;
    const skip = typeof entry.skip === 'string' ? entry.skip.slice(0, 120) : undefined;
    // Only a recording from the records folder, or one uploaded for a batch (a skipped app needs none).
    if (!skip && (!video || !(ownsVideo ? inside(video, uploads) : inside(video, records)) || !existsSync(video))) return fail(`Recording not found: ${String(entry.title ?? video)}`, 400);
    const appId = typeof entry.appId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.appId) ? entry.appId : null;
    items.push({
      title: String(entry.title ?? video).slice(0, 120),
      video: video ? resolve(video) : '',
      ownsVideo,
      appId,
      detectIndustry: entry.detectIndustry === true,
      skip,
    });
  }
  const batch = createBatch({ createdBy: admin.email, settings, items });
  return Response.json({ success: true, batch }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const params = new URL(request.url).searchParams;
  const action = params.get('action');
  if (!action || !['pause', 'resume', 'retry', 'skip', 'stop', 'clear'].includes(action)) return fail('action must be pause, resume, retry, skip, stop or clear.', 400);
  const batch = controlBatch(params.get('id') ?? '', action as 'pause', params.get('item') ?? undefined);
  if (!batch) return fail('No such batch.', 404);
  return Response.json({ success: true, batch }, { headers: { 'Cache-Control': 'no-store' } });
}
