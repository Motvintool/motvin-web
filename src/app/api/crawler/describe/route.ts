import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { activeJob, startJob } from '@/lib/server/ingestJobs';

/** A stored screenshot's path under its app's folder: `versions/<date>/[<flow>/]<name>.<ext>`, nothing that climbs out. */
const FILE = /^(?!.*\.\.)[a-z0-9][a-z0-9._/-]*\.(png|webp|jpe?g)$/i;

/**
 * POST /api/crawler/describe — `{ appId, platform?, files: string[], name? }`:
 * fill in screenshots the admin added by hand, the way a recording's screens
 * are: the on-device rules give their type (unless one was picked when adding
 * them), states, UI elements and style, and the AI names them and writes
 * their purpose when one is set up (`crawl.js describe`). Runs as a job like a
 * names rewrite, so the dock shows it.
 */
export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const running = activeJob();
  if (running) return fail(`A run is already in progress (${running.title}) — the new screens are added; describe them once it ends.`, 409);
  let body: { appId?: string; platform?: string; files?: unknown; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('The request could not be read.', 400);
  }
  const appId = String(body.appId ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(appId)) return fail('appId must be a slug.', 400);
  const platform = String(body.platform ?? 'ios').trim();
  if (!/^[a-z]+$/.test(platform)) return fail('platform must be a platform id.', 400);
  const files = Array.isArray(body.files) ? body.files.map((file) => String(file).trim()).filter(Boolean) : [];
  if (!files.length) return fail('files must list at least one screenshot.', 400);
  const bad = files.find((file) => !FILE.test(file));
  if (bad) return fail(`Not a stored screenshot: ${bad}`, 400);

  const count = files.length;
  const job = startJob({
    title: `Describing ${count} new ${body.name?.trim() || appId} screen${count === 1 ? '' : 's'}`,
    sizeBytes: null,
    startedBy: admin.email,
    workDir: null,
    args: ['describe', '--app-id', appId, '--platform', platform, '--files', files.join(',')],
    // A clean exit is its result, as for a names rewrite.
    mode: 'research',
  });
  return Response.json({ success: true, jobId: job.id, job }, { headers: { 'Cache-Control': 'no-store' } });
}
