import { createWriteStream, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { batchFilesDir } from '@/lib/server/batch';

/**
 * POST /api/crawler/batch/upload?ext=mov — a recording from the admin's
 * computer, kept for a batch until its app is in (then deleted). The raw body
 * is streamed to disk, as the single upload does. Returns its path on the
 * server, which the batch is created with.
 */

const VIDEO_EXT = new Set(['mov', 'mp4', 'm4v', 'avi', 'mkv']);
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const extension = (new URL(request.url).searchParams.get('ext')?.trim().toLowerCase() || 'mov').replace(/^\./, '');
  if (!VIDEO_EXT.has(extension)) return fail(`Unsupported video type ".${extension}".`, 400);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return fail('That recording is larger than 2 GB.', 413);
  if (!request.body) return fail('No video in the request body.', 400);
  const dir = batchFilesDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`);
  try {
    await pipeline(Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(path));
  } catch (error) {
    await rm(path, { force: true });
    return fail((error as Error).message, 500);
  }
  return Response.json({ success: true, path }, { headers: { 'Cache-Control': 'no-store' } });
}
