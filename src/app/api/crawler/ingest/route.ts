import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { activeJob, startJob } from '@/lib/server/ingestJobs';
import type { ResumeConfig } from '@/lib/server/ingestJobs';

/**
 * POST /api/crawler/ingest — a screen recording in, a run started.
 *
 * The browser cannot run a video decoder, so the admin page hands the video
 * here and this route starts tools/ios-crawler on it as a subprocess. Running
 * the CLI rather than importing its modules is deliberate: it is the same
 * code path the terminal uses and the self-test covers, so the web route
 * cannot drift away from the tested one.
 *
 * The response is small and immediate — `{ jobId }` — because the run
 * outlives the request. Its progress is read from /api/crawler/jobs, by any
 * page, for as long as it takes.
 *
 * The video arrives as a raw body rather than multipart form data, matching
 * the convention the backend's upload endpoints already use, and is streamed
 * straight to disk so a 300 MB recording never sits in memory.
 */

/** Hard ceiling on an upload. A three-minute recording is well under this. */
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Extensions the crawler recognises as a recording. */
const VIDEO_EXT = new Set(['mov', 'mp4', 'm4v', 'avi', 'mkv']);

export type { IngestEvent, IngestResult, IngestScreen } from '@/lib/inspirations/admin-chatbot/ingestJobs';

export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);

  const running = activeJob();
  if (running) {
    return fail(
      running.status === 'awaiting-review'
        ? `“${running.title}” is waiting for a decision — automatic or manual — before another upload can start.`
        : `A run is already in progress (${running.title}). Wait for it to finish before starting another.`,
      409,
    );
  }

  const params = new URL(request.url).searchParams;
  const extension = (params.get('ext')?.trim().toLowerCase() || 'mov').replace(/^\./, '');
  // One frame every 0.3 seconds by default (about 3.33 a second) — the
  // admin's own choice, trading some fast-screen coverage for a shorter
  // run; see the note on DEFAULT_FPS in tools/ios-crawler/src/ingest.js.
  const fps = Number(params.get('fps') ?? 10 / 3);
  const minHold = Number(params.get('minHold') ?? 0.5);
  const keepBrief = params.get('brief') !== '0';
  const keepLoading = params.get('loading') === '1';
  const platform = (params.get('platform') ?? 'ios').trim().toLowerCase();
  if (!['ios', 'android', 'web'].includes(platform)) return fail('platform must be ios, android or web.', 400);
  // Which dated capture to publish into — omit to let the crawler default to
  // today, so a re-run on a later day lands alongside the last one instead of
  // merging into it.
  const version = params.get('version')?.trim() || null;
  if (version && !/^\d{4}-\d{2}-\d{2}$/.test(version)) return fail('version must be in YYYY-MM-DD form.', 400);
  // An app already in the library — skips identification, so these screens
  // are added to it rather than possibly identified as a new one. Omit for
  // "New app", the admin page's default, where the app is worked out from
  // the screens themselves.
  const appId = params.get('appId')?.trim() || null;
  if (appId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(appId)) return fail('appId must be lower-case letters, digits and hyphens.', 400);

  // The video's own name is the last resort for naming the app, used when no
  // analyzer can identify it. A fixed temp name would make every such upload an
  // app called "upload", so the browser's file name is carried through.
  const originalName = params.get('name') ?? '';
  const sourceName =
    originalName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9 _-]+/g, ' ')
      .trim()
      .slice(0, 60) || 'recording';

  if (!VIDEO_EXT.has(extension)) return fail(`Unsupported video type ".${extension}".`, 400);
  if (!Number.isFinite(fps) || fps < 1 || fps > 15) return fail('fps must be between 1 and 15.', 400);
  if (!Number.isFinite(minHold) || minHold < 0.1 || minHold > 5) return fail('minHold must be between 0.1 and 5 seconds.', 400);
  if (!request.body) return fail('No video in the request body.', 400);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return fail('That recording is larger than 2 GB. Trim it and try again.', 413);

  const workDir = await mkdtemp(join(tmpdir(), 'motvin-web-ingest-'));
  const videoPath = join(workDir, `${sourceName}.${extension}`);

  try {
    await pipeline(Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(videoPath));
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    return fail((error as Error).message, 500);
  }
  const size = await stat(videoPath).then((info) => info.size).catch(() => null);

  // No --app: the app is identified from the screens, so an upload needs no
  // form first. The signed-in admin's address is recorded as who captured it.
  // --review: every upload pauses once its screens are found, before any of
  // them is sent to the analyzer, so the admin sees what was captured and
  // chooses "automatic" or "manual" before anything is classified or
  // published. resumeJob finishes it with exactly these same choices.
  const args = [
    'ingest',
    '--from', videoPath,
    '--authorized',
    '--authorized-by', admin.email,
    '--json',
    '--fps', String(fps),
    '--min-hold', String(minHold),
    '--platform', platform,
    ...(version ? ['--version', version] : []),
    ...(appId ? ['--app-id', appId] : []),
    ...(keepBrief ? [] : ['--no-brief']),
    ...(keepLoading ? ['--keep-loading'] : []),
    '--review',
  ];
  const resumeConfig: ResumeConfig = {
    appId,
    authorizedBy: admin.email,
    platform,
    version,
    keepLoading,
    dryRun: false,
  };

  const job = startJob({
    title: originalName || `${sourceName}.${extension}`,
    sizeBytes: size,
    startedBy: admin.email,
    workDir,
    args,
    resumeConfig,
  });

  return Response.json({ success: true, jobId: job.id, job }, { headers: { 'Cache-Control': 'no-store' } });
}
