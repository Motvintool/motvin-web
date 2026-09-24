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
 * The browser cannot run a video decoder, so the admin page hands the video
 * here and this route drives tools/ios-crawler as a subprocess. Running the CLI
 * rather than importing its modules is deliberate: it is the same code path
 * the terminal uses and the self-test covers, so the web route cannot drift
 * away from the tested one.
 *
 * The response is a stream of newline-delimited JSON, one object per line:
 *
 *   {"type":"progress", stage, message, …}   a stage began or advanced
 *   {"type":"log", line}                      a line the CLI printed for a person
 *   {"type":"result", data}                   the final result — the last line
 *   {"type":"error", message}                 the run failed — the last line
 *
 * A recording takes tens of seconds to read, classify and publish, and a
 * spinner for that long reads as a hang. Streaming the CLI's own stages lets
 * the page say "reading screen 7 of 23" instead.
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

/** Prefixes the CLI uses for its machine-readable lines. */
const RESULT_MARKER = 'MOTVIN_RESULT';
const PROGRESS_MARKER = 'MOTVIN_PROGRESS';

/** Extensions the crawler recognises as a recording. */
const VIDEO_EXT = new Set(['mov', 'mp4', 'm4v', 'avi', 'mkv']);

export type IngestScreen = {
  screenId: string;
  name: string;
  file: string;
  url: string;
  flow: string | null;
  flowName: string | null;
  position: number | null;
  screenType: string;
  publishedType: string;
  states: string[];
  brief: boolean;
  atSeconds: number | null;
  holdSeconds: number | null;
};

export type IngestResult = {
  ingested: number;
  duplicates: number;
  status: string;
  /** True only when a model analysed the screens; false for the on-device path. */
  classified: boolean;
  backend: string;
  grouped: boolean;
  app: { id: string; name: string; industry: string };
  identified: { confident: boolean; detected: boolean; evidence?: string | null } | null;
  excluded: { file: string; name: string; reason: string }[];
  skipped: { nodeId: string; name: string; screenType: string; reason: string }[];
  capture: { source: string; fps: number; frames: number; durationSeconds: number; excluded?: number } | null;
  timeline: {
    frames: number;
    fps: number;
    durationSeconds: number;
    dropped: { transitions: number; blank: number; scrims: number; revisits: number; merged: number };
  } | null;
  flows: { id: string; name: string; category: string; screenIds: string[] }[];
  screens: IngestScreen[];
};

export type IngestEvent =
  | { type: 'progress'; stage: string; message: string; done?: number; total?: number; frames?: number; screens?: number }
  | { type: 'log'; line: string }
  | { type: 'result'; data: IngestResult }
  | { type: 'error'; message: string };

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
  const fps = Number(params.get('fps') ?? 5);
  const minHold = Number(params.get('minHold') ?? 0.5);
  const keepBrief = params.get('brief') !== '0';
  const skipLoading = params.get('loading') === '0';

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

  // No --app: the app is identified from the screens, so an upload needs no
  // form first. The signed-in admin's address is recorded as who captured it.
  const args = [
    'ingest',
    '--from', videoPath,
    '--authorized',
    '--authorized-by', admin.email,
    '--json',
    '--fps', String(fps),
    '--min-hold', String(minHold),
    ...(keepBrief ? [] : ['--no-brief']),
    ...(skipLoading ? ['--skip-loading'] : []),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: IngestEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let closed = false;
      const finish = async () => {
        if (closed) return;
        closed = true;
        await rm(workDir, { recursive: true, force: true });
        controller.close();
      };
      runCrawler(args, send)
        .then(async (outcome) => {
          if (outcome.ok) send({ type: 'result', data: outcome.data });
          else send({ type: 'error', message: outcome.message });
          await finish();
        })
        .catch(async (error: Error) => {
          send({ type: 'error', message: error.message });
          await finish();
        });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Runs the CLI, relaying its progress lines as they arrive, and resolves with
 * the marked result line.
 *
 * On failure the last few log lines become the message, because the CLI's own
 * errors ("no frame held still long enough…", "the analyzer stopped
 * responding…") are already written for a person to read and are far more
 * useful than an exit code.
 */
function runCrawler(
  args: string[],
  send: (event: IngestEvent) => void,
): Promise<{ ok: true; data: IngestResult } | { ok: false; message: string }> {
  const script = join(process.cwd(), 'tools', 'ios-crawler', 'crawl.js');

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: join(process.cwd(), 'tools', 'ios-crawler'),
      env: { ...process.env, NO_COLOR: '1' },
    });

    let result: IngestResult | null = null;
    let resultError: string | null = null;
    const humanLines: string[] = [];
    let buffer = '';

    const handleLine = (raw: string) => {
      const line = raw.replace(/\r$/, '');
      if (!line.trim()) return;
      if (line.startsWith(PROGRESS_MARKER)) {
        try {
          const event = JSON.parse(line.slice(PROGRESS_MARKER.length).trim()) as Omit<Extract<IngestEvent, { type: 'progress' }>, 'type'>;
          send({ type: 'progress', ...event });
        } catch {
          // A malformed progress line is not worth failing the run for.
        }
        return;
      }
      if (line.startsWith(RESULT_MARKER)) {
        try {
          result = JSON.parse(line.slice(RESULT_MARKER.length).trim()) as IngestResult;
        } catch {
          resultError = 'The crawler returned a result that could not be read.';
        }
        return;
      }
      const clean = line.replace(/^[✗!›✓⊘]\s*/, '').trim();
      humanLines.push(clean);
      send({ type: 'log', line: line.trim() });
    };

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf-8').split('\n')) {
        if (line.trim()) humanLines.push(line.trim());
      }
    });

    child.on('error', (error) => resolve({ ok: false, message: `Could not start the crawler: ${error.message}` }));

    child.on('close', (code) => {
      if (buffer.trim()) handleLine(buffer);
      if (result) return resolve({ ok: true, data: result });
      if (resultError) return resolve({ ok: false, message: resultError });
      resolve({
        ok: false,
        message: humanLines.filter(Boolean).slice(-4).join(' — ') || `The crawler exited with code ${code}.`,
      });
    });
  });
}
