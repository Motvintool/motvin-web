import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { pickFolder, recordsDir, setRecordsDir } from '@/lib/server/batch';

/**
 * GET /api/crawler/batch/records — the recordings and logos kept on this
 * machine (the records folder: iOS/, Web Apps/, Webs/ and Logos/), for a batch
 * to pick from without uploading anything.
 * GET ?logo=<file name> — that logo's bytes, for the browser to set it on the app.
 * POST — choose the records folder: { path } as typed, or { pick: true } for the
 * Mac's own folder picker (the server runs on this Mac). Either layout works:
 * iOS/, Web Apps/, Webs/ and Logos/ inside it, or the videos and logos loose.
 */

const VIDEO_EXT = new Set(['.mov', '.mp4', '.m4v', '.avi', '.mkv']);
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const FOLDERS: Array<{ folder: string; platform: 'ios' | 'webapp' | 'web' }> = [
  { folder: 'iOS', platform: 'ios' },
  { folder: 'Web Apps', platform: 'webapp' },
  { folder: 'Webs', platform: 'web' },
];

export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const root = recordsDir();
  // Logos in a Logos folder, or loose next to the videos.
  const logosDir = existsSync(join(root, 'Logos')) ? join(root, 'Logos') : root;
  const logoName = new URL(request.url).searchParams.get('logo');
  if (logoName) {
    // A file name only — never a path out of the logos folder.
    const file = basename(logoName);
    const type = IMAGE_TYPES[extname(file).toLowerCase()];
    const path = join(logosDir, file);
    if (!type || file !== logoName || !existsSync(path)) return fail('No such logo.', 404);
    return new Response(readFileSync(path), { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
  }
  const videos: Array<{ name: string; file: string; path: string; platform: string; sizeBytes: number }> = [];
  for (const { folder, platform } of FOLDERS) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!VIDEO_EXT.has(extname(file).toLowerCase())) continue;
      const path = join(dir, file);
      videos.push({ name: file.replace(/\.[^.]+$/, ''), file, path, platform, sizeBytes: statSync(path).size });
    }
  }
  // Videos loose in the folder itself belong to whichever platform the batch is for.
  for (const file of existsSync(root) ? readdirSync(root) : []) {
    if (!VIDEO_EXT.has(extname(file).toLowerCase())) continue;
    const path = join(root, file);
    videos.push({ name: file.replace(/\.[^.]+$/, ''), file, path, platform: 'any', sizeBytes: statSync(path).size });
  }
  const logos = existsSync(logosDir) ? readdirSync(logosDir).filter((file) => IMAGE_TYPES[extname(file).toLowerCase()]) : [];
  return Response.json({ root, videos, logos }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const body = (await request.json().catch(() => ({}))) as { path?: string; pick?: boolean };
  const path = body.pick ? await pickFolder() : typeof body.path === 'string' ? body.path.trim().replace(/^~(?=\/)/, process.env.HOME ?? '~') : null;
  if (!path) return Response.json({ success: false, cancelled: true, root: recordsDir() }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    return Response.json({ success: true, root: setRecordsDir(path) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail((error as Error).message, 400);
  }
}
