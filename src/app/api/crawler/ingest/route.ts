import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * POST /api/crawler/ingest — a screen recording in, captured screens out.
 *
 * The browser cannot run ffmpeg, so the admin page hands the video here and
 * this route drives tools/ios-crawler as a subprocess. Running the CLI rather
 * than importing its modules is deliberate: it is the same code path the
 * terminal uses and the self-test covers, so the web route cannot drift away
 * from the tested one.
 *
 * Authorization is delegated, not reimplemented. The caller's Firebase token is
 * passed to the backend's own admin session endpoint, and only a 200 from there
 * lets the work start — so this route can never become a second, weaker door
 * into the same store.
 *
 * The video arrives as a raw body rather than multipart form data, matching the
 * convention the backend's upload endpoints already use, and is streamed
 * straight to disk so a 300 MB recording never sits in memory.
 */

/** Hard ceiling on an upload. A three-minute recording is well under this. */
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Prefix the CLI uses for its machine-readable result line. */
const RESULT_MARKER = 'MOTVIN_RESULT';

/** Extensions the crawler recognises as a recording. */
const VIDEO_EXT = new Set(['mov', 'mp4', 'm4v', 'avi', 'mkv']);

type CliResult = {
  ingested: number;
  duplicates: number;
  status: string;
  /** True only when a model analysed the screens; false for the on-device path. */
  classified: boolean;
  backend: string;
  grouped: boolean;
  app: { id: string; name: string; industry: string };
  identified: { confident: boolean; detected: boolean } | null;
  flows: { id: string; name: string; category: string; screenIds: string[] }[];
  screens: {
    screenId: string;
    file: string;
    flow: string | null;
    position: number | null;
    screenType: string;
    publishedType: string;
  }[];
};

function backendBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
  return configured || 'http://localhost:3000';
}

function fail(message: string, status: number) {
  return Response.json({ success: false, message }, { status });
}

/**
 * Confirms the caller is an admin by asking the backend, which owns the
 * allowlist and the token verification.
 */
async function verifyAdmin(request: Request): Promise<{ email: string } | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  try {
    const res = await fetch(`${backendBase()}/api/inspirations/admin/session`, {
      headers: { Authorization: authorization },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { data?: { admin?: { email?: string } } };
    const email = payload.data?.admin?.email;
    return email ? { email } : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);

  const params = new URL(request.url).searchParams;
  const extension = (params.get('ext')?.trim().toLowerCase() || 'mov').replace(/^\./, '');
  const fps = Number(params.get('fps') ?? 2);
  const minRun = Number(params.get('minRun') ?? 2);

  // The video's own name is the last resort for naming the app, used when no
  // analyzer can identify it. A fixed temp name would make every such upload an
  // app called "upload", so the browser's file name is carried through.
  const sourceName =
    (params.get('name') ?? '')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9 _-]+/g, ' ')
      .trim()
      .slice(0, 60) || 'recording';

  if (!VIDEO_EXT.has(extension)) return fail(`Unsupported video type ".${extension}".`, 400);
  if (!Number.isFinite(fps) || fps < 1 || fps > 10) return fail('fps must be between 1 and 10.', 400);
  if (!Number.isFinite(minRun) || minRun < 1 || minRun > 20) return fail('minRun must be between 1 and 20.', 400);
  if (!request.body) return fail('No video in the request body.', 400);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return fail('That recording is larger than 2 GB. Trim it and try again.', 413);

  const workDir = await mkdtemp(join(tmpdir(), 'motvin-web-ingest-'));
  const videoPath = join(workDir, `${sourceName}.${extension}`);

  try {
    await pipeline(Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(videoPath));

    // No --app: the app is identified from the screens, so an upload needs no
    // form first. The signed-in admin's address is recorded as who captured it.
    const result = await runCrawler([
      'ingest',
      '--from', videoPath,
      '--authorized',
      '--authorized-by', admin.email,
      '--json',
      '--fps', String(fps),
      '--min-run', String(minRun),
    ]);

    if (!result.ok) return fail(result.message, 422);
    return Response.json({ success: true, data: result.data });
  } catch (error) {
    return fail((error as Error).message, 500);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Runs the CLI and pulls the marked result line out of its output.
 *
 * On failure the last few log lines become the message, because the CLI's own
 * errors ("ffmpeg is needed…", "no frame held still long enough…") are already
 * written for a person to read and are far more useful than an exit code.
 */
function runCrawler(args: string[]): Promise<{ ok: true; data: CliResult } | { ok: false; message: string }> {
  const script = join(process.cwd(), 'tools', 'ios-crawler', 'crawl.js');

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: join(process.cwd(), 'tools', 'ios-crawler'),
      env: { ...process.env, NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => resolve({ ok: false, message: `Could not start the crawler: ${error.message}` }));

    child.on('close', (code) => {
      const marked = stdout.split('\n').find((line) => line.startsWith(RESULT_MARKER));
      if (marked) {
        try {
          return resolve({ ok: true, data: JSON.parse(marked.slice(RESULT_MARKER.length).trim()) as CliResult });
        } catch {
          return resolve({ ok: false, message: 'The crawler returned a result that could not be read.' });
        }
      }

      const lines = `${stdout}\n${stderr}`
        .split('\n')
        .map((line) => line.replace(/^[✗!›✓⊘]\s*/, '').trim())
        .filter(Boolean);
      resolve({
        ok: false,
        message: lines.slice(-4).join(' — ') || `The crawler exited with code ${code}.`,
      });
    });
  });
}
